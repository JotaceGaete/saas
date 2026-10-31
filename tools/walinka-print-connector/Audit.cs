namespace WalinkaPrintConnector;

/// <summary>
/// Auditoría mínima: fecha, evento, origen, impresora, clave e resultado.
/// Nunca escribe tokens, códigos de emparejamiento ni contenido de tickets.
/// </summary>
public sealed class Audit
{
    private readonly string _path;
    private readonly object _lock = new();

    public Audit(string dataDir)
    {
        Directory.CreateDirectory(dataDir);
        _path = Path.Combine(dataDir, "audit.log");
    }

    public void Write(string evt, string? origin, string? printer, string? key, string result)
    {
        var line = string.Join('\t', new[]
        {
            DateTime.UtcNow.ToString("o"),
            Clean(evt),
            Clean(origin ?? "-"),
            Clean(printer ?? "-"),
            Clean(key ?? "-"),
            Clean(result),
        });
        lock (_lock)
        {
            File.AppendAllText(_path, line + Environment.NewLine);
        }
    }

    private static string Clean(string value)
        => new string(value.Where(c => !char.IsControl(c)).Take(200).ToArray());
}
