namespace WalinkaPrintConnector;

/// <summary>
/// Registro de trabajos por clave de idempotencia. Persistido en disco:
/// un reinicio del conector no vuelve a imprimir un trabajo ya enviado.
/// Estados: printing, sent_to_spooler (aceptado por Windows, NO impreso confirmado), failed.
/// </summary>
public sealed class JobStore
{
    public const string Printing = "printing";
    public const string SentToSpooler = "sent_to_spooler";
    public const string Failed = "failed";

    private const int MaxRecords = 5000;
    private static readonly TimeSpan Retention = TimeSpan.FromDays(7);

    private readonly string _path;
    private readonly object _lock = new();

    public JobStore(string dataDir)
    {
        Directory.CreateDirectory(dataDir);
        _path = Path.Combine(dataDir, "jobs.json");
    }

    public sealed class JobRecord
    {
        public string Key { get; set; } = string.Empty;
        public string PrinterName { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public DateTime CreatedUtc { get; set; }
        public DateTime UpdatedUtc { get; set; }
        public string? Error { get; set; }
    }

    public enum BeginOutcome { Started, Duplicate }

    /// <summary>
    /// Si la clave no existe o su intento anterior falló, la registra como "printing" y devuelve Started.
    /// Si ya fue enviada o está en curso, devuelve Duplicate sin tocar el registro.
    /// </summary>
    public BeginOutcome Begin(string key, string printerName, DateTime nowUtc, out JobRecord record)
    {
        lock (_lock)
        {
            var all = Load();
            Prune(all, nowUtc);
            if (all.TryGetValue(key, out record!))
            {
                if (record.Status != Failed) return BeginOutcome.Duplicate;
                record.Status = Printing;
                record.PrinterName = printerName;
                record.UpdatedUtc = nowUtc;
                record.Error = null;
                Save(all);
                return BeginOutcome.Started;
            }

            record = new JobRecord
            {
                Key = key,
                PrinterName = printerName,
                Status = Printing,
                CreatedUtc = nowUtc,
                UpdatedUtc = nowUtc,
            };
            all[key] = record;
            Save(all);
            return BeginOutcome.Started;
        }
    }

    public void Complete(string key, string status, DateTime nowUtc, string? error = null)
    {
        lock (_lock)
        {
            var all = Load();
            if (!all.TryGetValue(key, out var record)) return;
            record.Status = status;
            record.UpdatedUtc = nowUtc;
            record.Error = error;
            Save(all);
        }
    }

    public JobRecord? Get(string key)
    {
        lock (_lock)
        {
            return Load().TryGetValue(key, out var record) ? record : null;
        }
    }

    private Dictionary<string, JobRecord> Load()
    {
        if (!File.Exists(_path)) return new Dictionary<string, JobRecord>();
        try
        {
            var list = JsonSerializer.Deserialize<List<JobRecord>>(File.ReadAllText(_path)) ?? new List<JobRecord>();
            return list.ToDictionary(r => r.Key, r => r);
        }
        catch (JsonException)
        {
            // Archivo corrupto: se conserva como respaldo y se empieza de cero.
            File.Move(_path, _path + ".corrupt-" + DateTime.UtcNow.ToString("yyyyMMddHHmmss"), overwrite: true);
            return new Dictionary<string, JobRecord>();
        }
    }

    private static void Prune(Dictionary<string, JobRecord> all, DateTime nowUtc)
    {
        foreach (var key in all.Where(kv => nowUtc - kv.Value.CreatedUtc > Retention).Select(kv => kv.Key).ToList())
        {
            all.Remove(key);
        }
        if (all.Count > MaxRecords)
        {
            foreach (var key in all.OrderBy(kv => kv.Value.CreatedUtc).Take(all.Count - MaxRecords).Select(kv => kv.Key).ToList())
            {
                all.Remove(key);
            }
        }
    }

    private void Save(Dictionary<string, JobRecord> all)
    {
        var tmp = _path + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(all.Values.ToList(), JsonOptions.Pretty));
        File.Move(tmp, _path, overwrite: true);
    }
}
