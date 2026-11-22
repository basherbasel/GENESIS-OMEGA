param(
  [string]$Mode = 'Attach',
  [int]$TargetPid = 0,
  [string]$Exe = '',
  [string]$ArgsPacked = '',
  [string]$WorkingDirectory = '',
  [string]$StdoutFile = '',
  [string]$StderrFile = '',
  [Parameter(Mandatory=$true)][string]$StatusFile,
  [int]$PollMs = 250,
  [int]$TimeoutMs = 600000
)

$src = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class JobSandbox {
  [StructLayout(LayoutKind.Sequential)]
  public struct IO_COUNTERS {
    public ulong ReadOperationCount;
    public ulong WriteOperationCount;
    public ulong OtherOperationCount;
    public ulong ReadTransferCount;
    public ulong WriteTransferCount;
    public ulong OtherTransferCount;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
    public long PerProcessUserTimeLimit;
    public long PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize;
    public UIntPtr MaximumWorkingSetSize;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass;
    public uint SchedulingClass;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
    public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
    public IO_COUNTERS IoInfo;
    public UIntPtr ProcessMemoryLimit;
    public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryUsed;
    public UIntPtr PeakJobMemoryUsed;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct STARTUPINFO {
    public uint cb;
    public string lpReserved;
    public string lpDesktop;
    public string lpTitle;
    public uint dwX;
    public uint dwY;
    public uint dwXSize;
    public uint dwYSize;
    public uint dwXCountChars;
    public uint dwYCountChars;
    public uint dwFillAttribute;
    public uint dwFlags;
    public short wShowWindow;
    public short cbReserved2;
    public IntPtr lpReserved2;
    public IntPtr hStdInput;
    public IntPtr hStdOutput;
    public IntPtr hStdError;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct PROCESS_INFORMATION {
    public IntPtr hProcess;
    public IntPtr hThread;
    public uint dwProcessId;
    public uint dwThreadId;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct SECURITY_ATTRIBUTES {
    public uint nLength;
    public IntPtr lpSecurityDescriptor;
    public bool bInheritHandle;
  }

  [DllImport("kernel32.dll", SetLastError=true, EntryPoint="CreateJobObjectW", CharSet=CharSet.Unicode)]
  public static extern IntPtr CreateJobObject(IntPtr attrs, string name);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool SetInformationJobObject(
    IntPtr job, int infoClass, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, uint infoSize);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr OpenProcess(int access, bool inherit, int pid);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr proc);

  [DllImport("kernel32.dll", SetLastError=true, EntryPoint="CreateProcessW", CharSet=CharSet.Unicode)]
  public static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool inherit,
    uint flags, IntPtr env, string dir, ref STARTUPINFO si, out PROCESS_INFORMATION pi);

  [DllImport("kernel32.dll", SetLastError=true, EntryPoint="CreateFileW", CharSet=CharSet.Unicode)]
  public static extern IntPtr CreateFile(string path, uint access, uint share,
    ref SECURITY_ATTRIBUTES security, uint creation, uint attributes, IntPtr template);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool CloseHandle(IntPtr handle);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern uint WaitForSingleObject(IntPtr handle, uint ms);

  private static IntPtr CreateJob() {
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    if (job == IntPtr.Zero) throw new Exception("CREATE_JOB_FAILED:" + Marshal.GetLastWin32Error());
    var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
    // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE (0x2000) kills descendants with this supervisor.
    info.BasicLimitInformation.LimitFlags = 0x2000;
    uint size = (uint)Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
    if (!SetInformationJobObject(job, 9, ref info, size))
      throw new Exception("SET_LIMIT_FAILED:" + Marshal.GetLastWin32Error() + ":" + size);
    return job;
  }

  public static string Attach(int pid) {
    try {
      IntPtr job = CreateJob();
      IntPtr proc = OpenProcess(0x0200 | 0x0001, false, pid);
      if (proc == IntPtr.Zero) throw new Exception("OPEN_PROCESS_FAILED:" + Marshal.GetLastWin32Error());
      if (!AssignProcessToJobObject(job, proc)) throw new Exception("ASSIGN_FAILED:" + Marshal.GetLastWin32Error());
      CloseHandle(proc);
      return "ATTACHED|" + pid;
    } catch (Exception ex) { return ex.Message; }
  }

  public static string Launch(string exe, string argsPacked, string cwd, string outFile, string errFile) {
    IntPtr job = IntPtr.Zero;
    IntPtr hOut = IntPtr.Zero;
    IntPtr hErr = IntPtr.Zero;
    try {
      job = CreateJob();
      var sa = new SECURITY_ATTRIBUTES();
      sa.nLength = (uint)Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
      sa.bInheritHandle = true; // required for STARTF_USESTDHANDLES redirection
      hOut = CreateFile(outFile, 0x40000000, 3, ref sa, 2, 0x80, IntPtr.Zero);
      hErr = CreateFile(errFile, 0x40000000, 3, ref sa, 2, 0x80, IntPtr.Zero);
      if (hOut == IntPtr.Zero || hErr == IntPtr.Zero)
        throw new Exception("CREATE_LOG_FAILED:" + Marshal.GetLastWin32Error());

      // Unit separator cannot occur in a normal command-line argument.
      string[] args = string.IsNullOrEmpty(argsPacked)
        ? new string[0]
        : argsPacked.Split('\u001f');
      string quoted = "\"" + exe.Replace("\"", "\\\"") + "\"";
      foreach (string a in args) quoted += " \"" + a.Replace("\"", "\\\"") + "\"";

      var si = new STARTUPINFO();
      si.cb = (uint)Marshal.SizeOf(typeof(STARTUPINFO));
      si.dwFlags = 0x00000100; // STARTF_USESTDHANDLES
      si.hStdInput = IntPtr.Zero;
      si.hStdOutput = hOut;
      si.hStdError = hErr;

      PROCESS_INFORMATION pi;
      // CREATE_BREAKAWAY_FROM_JOB (0x01000000): the child leaves the parent's
      // job so it can be assigned to this one. Inherited env is the filtered
      // environment supplied to this supervisor by Node.
      bool created = CreateProcess(null, quoted, IntPtr.Zero, IntPtr.Zero, true,
        0x01000000, IntPtr.Zero, string.IsNullOrEmpty(cwd) ? null : cwd, ref si, out pi);
      if (!created) throw new Exception("CREATE_PROCESS_FAILED:" + Marshal.GetLastWin32Error());

      if (!AssignProcessToJobObject(job, pi.hProcess)) {
        int err = Marshal.GetLastWin32Error();
        CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
        throw new Exception("ASSIGN_FAILED:" + err);
      }
      CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
      return "ATTACHED|" + pi.dwProcessId;
    } catch (Exception ex) { return ex.Message; }
    finally {
      // Keep the job open: the PowerShell process holds it until it exits.
      // Log handles are inherited by the child and are released on exit.
      if (hOut != IntPtr.Zero) CloseHandle(hOut);
      if (hErr != IntPtr.Zero) CloseHandle(hErr);
    }
  }
}
'@
Add-Type -TypeDefinition $src -ErrorAction Stop

if ($Mode -eq 'Launch') {
  $result = [JobSandbox]::Launch($Exe, $ArgsPacked, $WorkingDirectory, $StdoutFile, $StderrFile)
} else {
  $result = [JobSandbox]::Attach($TargetPid)
}
[System.IO.File]::WriteAllText($StatusFile, $result)
if (-not $result.StartsWith('ATTACHED')) { exit 1 }

$parts = $result.Split('|')
$watchedPid = [int]$parts[1]
$deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
while ([DateTime]::UtcNow -lt $deadline) {
  if (-not (Get-Process -Id $watchedPid -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds $PollMs
}
