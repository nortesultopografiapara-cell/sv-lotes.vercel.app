if (-not ('SvLotesCredential' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class SvLotesCredential {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct Native {
    public uint Flags;
    public uint Type;
    public string TargetName;
    public string Comment;
    public long LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }
  [DllImport("advapi32", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredWrite(ref Native credential, uint flags);
  [DllImport("advapi32", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32")]
  public static extern void CredFree(IntPtr credential);

  public static void WriteSecret(string target, string secret) {
    byte[] bytes = Encoding.Unicode.GetBytes(secret ?? "");
    IntPtr blob = Marshal.AllocHGlobal(bytes.Length);
    try {
      Marshal.Copy(bytes, 0, blob, bytes.Length);
      Native cred = new Native();
      cred.Type = 1;
      cred.TargetName = target;
      cred.CredentialBlobSize = (uint)bytes.Length;
      cred.CredentialBlob = blob;
      cred.Persist = 2;
      cred.UserName = "sv-lotes-develop";
      if (!CredWrite(ref cred, 0)) {
        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
      }
    } finally {
      Marshal.FreeHGlobal(blob);
    }
  }

  public static string ReadSecret(string target) {
    IntPtr ptr;
    if (!CredRead(target, 1, 0, out ptr)) return null;
    try {
      Native cred = (Native)Marshal.PtrToStructure(ptr, typeof(Native));
      if (cred.CredentialBlob == IntPtr.Zero || cred.CredentialBlobSize == 0) return "";
      byte[] bytes = new byte[cred.CredentialBlobSize];
      Marshal.Copy(cred.CredentialBlob, bytes, 0, bytes.Length);
      return Encoding.Unicode.GetString(bytes);
    } finally {
      CredFree(ptr);
    }
  }
}
'@
}
