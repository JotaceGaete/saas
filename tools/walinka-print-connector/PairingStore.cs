namespace WalinkaPrintConnector;

/// <summary>
/// Emparejamiento: un código de 6 dígitos de un solo uso (5 minutos, 5 intentos)
/// canjeable por un token aleatorio. El servidor guarda solo hashes.
/// Se persiste en disco para que el comando "pair" (otro proceso) y el servicio compartan estado.
/// </summary>
public sealed class PairingStore
{
    public const int CodeValidMinutes = 5;
    public const int MaxAttempts = 5;

    private readonly string _pairingPath;
    private readonly string _tokensPath;
    private readonly object _lock = new();

    public PairingStore(string dataDir)
    {
        Directory.CreateDirectory(dataDir);
        _pairingPath = Path.Combine(dataDir, "pairing.json");
        _tokensPath = Path.Combine(dataDir, "tokens.json");
    }

    public enum RedeemResult { Ok, NoActiveCode, Expired, AlreadyUsed, TooManyAttempts, InvalidCode }

    public sealed class PairingState
    {
        public string CodeHash { get; set; } = string.Empty;
        public DateTime ExpiresUtc { get; set; }
        public int Attempts { get; set; }
        public bool Used { get; set; }
    }

    public sealed class TokenRecord
    {
        public string Id { get; set; } = string.Empty;
        public string TokenHash { get; set; } = string.Empty;
        public string Origin { get; set; } = string.Empty;
        public string DeviceName { get; set; } = string.Empty;
        public DateTime CreatedUtc { get; set; }
    }

    /// <summary>Genera un código nuevo e invalida el anterior. Devuelve el código en claro (solo para mostrarlo una vez).</summary>
    public string StartPairing(DateTime nowUtc)
    {
        lock (_lock)
        {
            var code = Secrets.NewPairingCode();
            var state = new PairingState
            {
                CodeHash = Secrets.Sha256Hex(code),
                ExpiresUtc = nowUtc.AddMinutes(CodeValidMinutes),
                Attempts = 0,
                Used = false,
            };
            WriteJson(_pairingPath, state);
            return code;
        }
    }

    public RedeemResult TryRedeem(string code, string origin, string deviceName, DateTime nowUtc, out string? token)
    {
        token = null;
        lock (_lock)
        {
            var state = ReadJson<PairingState>(_pairingPath);
            if (state is null || string.IsNullOrEmpty(state.CodeHash)) return RedeemResult.NoActiveCode;
            if (state.Used) return RedeemResult.AlreadyUsed;
            if (nowUtc > state.ExpiresUtc) return RedeemResult.Expired;
            if (state.Attempts >= MaxAttempts) return RedeemResult.TooManyAttempts;

            if (!Secrets.ConstantTimeEquals(state.CodeHash, Secrets.Sha256Hex(code)))
            {
                state.Attempts++;
                WriteJson(_pairingPath, state);
                return state.Attempts >= MaxAttempts ? RedeemResult.TooManyAttempts : RedeemResult.InvalidCode;
            }

            state.Used = true;
            WriteJson(_pairingPath, state);

            var newToken = Secrets.NewToken();
            var tokens = ReadTokens();
            tokens.Add(new TokenRecord
            {
                Id = Guid.NewGuid().ToString("N"),
                TokenHash = Secrets.Sha256Hex(newToken),
                Origin = origin,
                DeviceName = Sanitize(deviceName),
                CreatedUtc = nowUtc,
            });
            WriteJson(_tokensPath, tokens);
            token = newToken;
            return RedeemResult.Ok;
        }
    }

    /// <summary>Verifica el token y que pertenezca al mismo origen con el que se emparejó.</summary>
    public bool Authenticate(string token, string origin)
    {
        if (string.IsNullOrEmpty(token)) return false;
        lock (_lock)
        {
            var hash = Secrets.Sha256Hex(token);
            var match = false;
            foreach (var record in ReadTokens())
            {
                // Recorre todos para no filtrar por tiempo cuál existe.
                var sameHash = Secrets.ConstantTimeEquals(record.TokenHash, hash);
                var sameOrigin = string.Equals(record.Origin, origin, StringComparison.OrdinalIgnoreCase);
                match |= sameHash && sameOrigin;
            }
            return match;
        }
    }

    public int Revoke()
    {
        lock (_lock)
        {
            var count = ReadTokens().Count;
            WriteJson(_tokensPath, new List<TokenRecord>());
            return count;
        }
    }

    public int PairedDeviceCount()
    {
        lock (_lock) return ReadTokens().Count;
    }

    private static string Sanitize(string? deviceName)
    {
        var clean = new string((deviceName ?? string.Empty).Where(c => !char.IsControl(c)).Take(64).ToArray());
        return clean.Length == 0 ? "equipo" : clean;
    }

    private List<TokenRecord> ReadTokens() => ReadJson<List<TokenRecord>>(_tokensPath) ?? new List<TokenRecord>();

    private static T? ReadJson<T>(string path) where T : class
    {
        if (!File.Exists(path)) return null;
        try
        {
            return JsonSerializer.Deserialize<T>(File.ReadAllText(path));
        }
        catch (JsonException)
        {
            // Archivo corrupto: se trata como vacío (no hay códigos ni tokens válidos).
            return null;
        }
    }

    private static void WriteJson<T>(string path, T value)
    {
        var tmp = path + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(value, JsonOptions.Pretty));
        File.Move(tmp, path, overwrite: true);
    }
}
