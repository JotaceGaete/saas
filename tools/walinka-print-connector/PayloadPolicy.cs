using System.Text.RegularExpressions;

namespace WalinkaPrintConnector;

/// <summary>
/// Validación de lo que llega desde el navegador. No interpreta el contenido ESC/POS:
/// solo verifica tamaño, inicialización y formato de las claves.
/// Nota: no se escanea ESC p porque los datos de imagen (ESC *) pueden contener esos bytes.
/// El cajón no está expuesto por ningún endpoint ni comando de esta versión.
/// </summary>
public static class PayloadPolicy
{
    public const int MaxDecodedBytes = 256 * 1024;

    private static readonly Regex KeyPattern = new(@"^[A-Za-z0-9:_\-]{8,128}$", RegexOptions.Compiled);

    public static string? ValidatePayload(byte[] data)
    {
        if (data.Length == 0) return "payload_empty";
        if (data.Length > MaxDecodedBytes) return "payload_too_large";
        if (data.Length < 2 || data[0] != 0x1B || data[1] != 0x40) return "payload_must_start_with_init";
        return null;
    }

    public static string? ValidateIdempotencyKey(string? key)
        => string.IsNullOrEmpty(key) || !KeyPattern.IsMatch(key) ? "invalid_idempotency_key" : null;

    public static string? ValidatePrinterName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Length > 256) return "invalid_printer_name";
        return name.Any(char.IsControl) ? "invalid_printer_name" : null;
    }
}
