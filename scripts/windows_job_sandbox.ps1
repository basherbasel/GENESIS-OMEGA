param(
  [Parameter(Mandatory=$true)][int]$TargetPid,
  [Parameter(Mandatory=$true)][string]$StatusFile,
  [int]$PollMs = 250,
  [int]$TimeoutMs = 300000
)

$src = @'
using System;
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

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr CreateJobObject(IntPtr attrs, string name);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool SetInformationJobObject(
    IntPtr job, int infoClass, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, uint infoSize);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr OpenProcess(int access, bool inherit, int pid);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr proc);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool CloseHandle(IntPtr handle);

  public static string Attach(int pid) {
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    if (job == IntPtr.Zero) return "CREATE_FAILED:" + Marshal.GetLastWin32Error();

    var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
    // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE (0x2000) — descendants die with this
    // supervisor. 0x0002 is PROCESS_TIME and requires a time limit.
    info.BasicLimitInformation.LimitFlags = 0x2000;
    int size = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
    if (!SetInformationJobObject(job, 9, ref info, (uint)size)) {
      int err = Marshal.GetLastWin32Error();
      CloseHandle(job);
      return "SET_LIMIT_FAILED:" + err;
    }

    IntPtr proc = OpenProcess(0x0200 | 0x0001, false, pid); // SET_QUOTA | TERMINATE
    if (proc == IntPtr.Zero) {
      int err = Marshal.GetLastWin32Error();
      CloseHandle(job);
      return "OPEN_PROCESS_FAILED:" + err;
    }
    if (!AssignProcessToJobObject(job, proc)) {
      int err = Marshal.GetLastWin32Error();
      CloseHandle(proc);
      CloseHandle(job);
      return "ASSIGN_FAILED:" + err;
    }
    CloseHandle(proc);
    // The job handle stays open in this process until the target exits.
    return "ATTACHED";
  }
}
'@
Add-Type -TypeDefinition $src -ErrorAction Stop
$result = [JobSandbox]::Attach($TargetPid)
[System.IO.File]::WriteAllText($StatusFile, $result)
if ($result -ne 'ATTACHED') { exit 1 }

$deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
while ([DateTime]::UtcNow -lt $deadline) {
  if (-not (Get-Process -Id $TargetPid -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds $PollMs
}
