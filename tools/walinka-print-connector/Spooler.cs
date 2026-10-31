using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace WalinkaPrintProbe;

/// <summary>
/// Envío RAW a la cola de impresión de Windows (winspool.drv).
/// Un resultado "enviado" significa solo que el spooler aceptó los bytes.
/// No confirma que el papel se haya impreso ni cortado.
/// </summary>
public static class Spooler
{
    private const int PRINTER_ENUM_LOCAL = 0x2;
    private const int PRINTER_ENUM_CONNECTIONS = 0x4;
    private const int PRINTER_INFO_LEVEL_2 = 2;

    // Bits de PRINTER_INFO_2.Status relevantes para el usuario.
    private const uint PRINTER_STATUS_PAUSED = 0x00000001;
    private const uint PRINTER_STATUS_ERROR = 0x00000002;
    private const uint PRINTER_STATUS_PAPER_JAM = 0x00000008;
    private const uint PRINTER_STATUS_PAPER_OUT = 0x00000010;
    private const uint PRINTER_STATUS_PAPER_PROBLEM = 0x00000040;
    private const uint PRINTER_STATUS_OFFLINE = 0x00000080;
    private const uint PRINTER_STATUS_DOOR_OPEN = 0x00400000;
    private const uint PRINTER_STATUS_NOT_AVAILABLE = 0x00001000;

    public sealed record PrinterInfo(string Name, string Port, string Driver, uint Status, uint Jobs, bool IsDefault);

    /// <summary>Datos de la cola que afectan cómo Windows entrega los bytes al hardware.</summary>
    public sealed record PrinterDetails(
        string Name, string Port, string Driver, string DefaultDatatype, string PrintProcessor,
        string ServerName, uint Attributes, uint Status, uint Jobs, bool IsDefault);

    public sealed class SpoolerException : Exception
    {
        public SpoolerException(string message, int win32Code) : base(message) => Win32Code = win32Code;
        public int Win32Code { get; }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DOC_INFO_1
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string? pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct PRINTER_INFO_2
    {
        public IntPtr pServerName;
        public IntPtr pPrinterName;
        public IntPtr pShareName;
        public IntPtr pPortName;
        public IntPtr pDriverName;
        public IntPtr pComment;
        public IntPtr pLocation;
        public IntPtr pDevMode;
        public IntPtr pSepFile;
        public IntPtr pPrintProcessor;
        public IntPtr pDatatype;
        public IntPtr pParameters;
        public IntPtr pSecurityDescriptor;
        public uint Attributes;
        public uint Priority;
        public uint DefaultPriority;
        public uint StartTime;
        public uint UntilTime;
        public uint Status;
        public uint cJobs;
        public uint AveragePPM;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern int StartDocPrinter(IntPtr hPrinter, int level, ref DOC_INFO_1 docInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr hPrinter, byte[] pBuf, int cbBuf, out int pcWritten);

    [DllImport("winspool.drv", EntryPoint = "EnumPrintersW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool EnumPrinters(int flags, string? name, int level, IntPtr pBuf, int cbBuf, out int pcbNeeded, out int pcReturned);

    [DllImport("winspool.drv", EntryPoint = "GetDefaultPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool GetDefaultPrinter(StringBuilder? pszBuffer, ref int pcchBuffer);

    public static List<PrinterInfo> ListPrinters()
    {
        var defaultName = GetDefaultPrinterName();
        EnumPrinters(PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS, null, PRINTER_INFO_LEVEL_2, IntPtr.Zero, 0, out int needed, out _);
        if (needed <= 0) return new List<PrinterInfo>();

        var buffer = Marshal.AllocHGlobal(needed);
        try
        {
            if (!EnumPrinters(PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS, null, PRINTER_INFO_LEVEL_2, buffer, needed, out _, out int returned))
            {
                throw Win32(Marshal.GetLastWin32Error(), "No se pudo listar las impresoras de Windows.");
            }

            var list = new List<PrinterInfo>(returned);
            var size = Marshal.SizeOf<PRINTER_INFO_2>();
            for (var i = 0; i < returned; i++)
            {
                var info = Marshal.PtrToStructure<PRINTER_INFO_2>(buffer + i * size);
                var name = Marshal.PtrToStringUni(info.pPrinterName) ?? string.Empty;
                list.Add(new PrinterInfo(
                    name,
                    Marshal.PtrToStringUni(info.pPortName) ?? string.Empty,
                    Marshal.PtrToStringUni(info.pDriverName) ?? string.Empty,
                    info.Status,
                    info.cJobs,
                    string.Equals(name, defaultName, StringComparison.OrdinalIgnoreCase)));
            }
            return list;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    public static PrinterDetails? GetDetails(string printerName)
    {
        var defaultName = GetDefaultPrinterName();
        EnumPrinters(PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS, null, PRINTER_INFO_LEVEL_2, IntPtr.Zero, 0, out int needed, out _);
        if (needed <= 0) return null;

        var buffer = Marshal.AllocHGlobal(needed);
        try
        {
            if (!EnumPrinters(PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS, null, PRINTER_INFO_LEVEL_2, buffer, needed, out _, out int returned))
            {
                throw Win32(Marshal.GetLastWin32Error(), "No se pudo leer la configuración de la impresora.");
            }

            var size = Marshal.SizeOf<PRINTER_INFO_2>();
            for (var i = 0; i < returned; i++)
            {
                var info = Marshal.PtrToStructure<PRINTER_INFO_2>(buffer + i * size);
                var name = Marshal.PtrToStringUni(info.pPrinterName) ?? string.Empty;
                if (!string.Equals(name, printerName, StringComparison.OrdinalIgnoreCase)) continue;

                return new PrinterDetails(
                    name,
                    Marshal.PtrToStringUni(info.pPortName) ?? string.Empty,
                    Marshal.PtrToStringUni(info.pDriverName) ?? string.Empty,
                    Marshal.PtrToStringUni(info.pDatatype) ?? string.Empty,
                    Marshal.PtrToStringUni(info.pPrintProcessor) ?? string.Empty,
                    Marshal.PtrToStringUni(info.pServerName) ?? string.Empty,
                    info.Attributes,
                    info.Status,
                    info.cJobs,
                    string.Equals(name, defaultName, StringComparison.OrdinalIgnoreCase));
            }
            return null;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    public static PrinterInfo? FindPrinter(string name)
        => ListPrinters().FirstOrDefault(p => string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase));

    /// <summary>Devuelve una descripción legible de los problemas que Windows reporta para la cola.</summary>
    public static IReadOnlyList<string> DescribeStatus(uint status)
    {
        var problems = new List<string>();
        if ((status & PRINTER_STATUS_OFFLINE) != 0) problems.Add("Windows reporta la impresora como SIN CONEXIÓN (apagada o desconectada).");
        if ((status & PRINTER_STATUS_NOT_AVAILABLE) != 0) problems.Add("La impresora no está disponible.");
        if ((status & PRINTER_STATUS_PAPER_OUT) != 0) problems.Add("Windows reporta SIN PAPEL.");
        if ((status & PRINTER_STATUS_PAPER_JAM) != 0) problems.Add("Windows reporta ATASCO de papel.");
        if ((status & PRINTER_STATUS_PAPER_PROBLEM) != 0) problems.Add("Windows reporta un problema con el papel.");
        if ((status & PRINTER_STATUS_DOOR_OPEN) != 0) problems.Add("La tapa de la impresora está abierta.");
        if ((status & PRINTER_STATUS_PAUSED) != 0) problems.Add("La cola de impresión está PAUSADA.");
        if ((status & PRINTER_STATUS_ERROR) != 0) problems.Add("Windows reporta un error en la impresora.");
        return problems;
    }

    /// <summary>
    /// Envía bytes RAW a la cola indicada. Devuelve cuando el spooler acepta el trabajo,
    /// no cuando la impresora termina de imprimir.
    /// </summary>
    public static void SendRaw(string printerName, byte[] data, string docName)
    {
        if (!OpenPrinter(printerName, out var handle, IntPtr.Zero) || handle == IntPtr.Zero)
        {
            throw MapOpenError(Marshal.GetLastWin32Error(), printerName);
        }

        try
        {
            var doc = new DOC_INFO_1 { pDocName = docName, pOutputFile = null, pDatatype = "RAW" };
            if (StartDocPrinter(handle, 1, ref doc) == 0)
            {
                throw Win32(Marshal.GetLastWin32Error(), "Windows no pudo iniciar el trabajo de impresión.");
            }

            try
            {
                if (!StartPagePrinter(handle))
                {
                    throw Win32(Marshal.GetLastWin32Error(), "Windows no pudo iniciar la página del trabajo.");
                }

                if (!WritePrinter(handle, data, data.Length, out int written) || written != data.Length)
                {
                    throw Win32(Marshal.GetLastWin32Error(),
                        $"Windows aceptó solo {written} de {data.Length} bytes. El trabajo puede estar incompleto.");
                }

                EndPagePrinter(handle);
            }
            finally
            {
                EndDocPrinter(handle);
            }
        }
        finally
        {
            ClosePrinter(handle);
        }
    }

    private static string GetDefaultPrinterName()
    {
        int size = 0;
        GetDefaultPrinter(null, ref size);
        if (size <= 0) return string.Empty;
        var sb = new StringBuilder(size);
        return GetDefaultPrinter(sb, ref size) ? sb.ToString() : string.Empty;
    }

    private static SpoolerException MapOpenError(int code, string printerName)
    {
        return code switch
        {
            1801 => new SpoolerException($"No existe una impresora llamada \"{printerName}\" en Windows. Revisa el nombre con 'list'.", code),
            5 => new SpoolerException($"Windows no te deja usar la impresora \"{printerName}\" (permiso denegado).", code),
            1722 => new SpoolerException("El servicio de cola de impresión de Windows (spooler) no responde. Reinícialo o reinicia el computador.", code),
            _ => Win32(code, $"No se pudo abrir la impresora \"{printerName}\"."),
        };
    }

    private static SpoolerException Win32(int code, string message)
    {
        var detail = new Win32Exception(code).Message;
        return new SpoolerException($"{message} (Windows: {detail}, código {code}).", code);
    }
}
