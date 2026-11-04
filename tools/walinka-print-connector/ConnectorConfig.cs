namespace WalinkaPrintConnector;

/// <summary>
/// Configuración persistida en %LOCALAPPDATA%\WalinkaPrintConnector\config.json.
/// Solo orígenes exactos: nunca comodines, nunca rutas.
/// </summary>
public sealed class ConnectorConfig
{
    public const int DefaultPort = 47801;

    public int Port { get; set; } = DefaultPort;

    /// <summary>
    /// Solo para desarrollo local (Walinka en http://localhost:5173). Por defecto
    /// false: la configuración de producción nunca acepta localhost como origen.
    /// </summary>
    public bool AllowLocalDevOrigin { get; set; } = false;

    /// <summary>
    /// Permite que una Preview de Vercel del proyecto Walinka (ver PreviewOrigins)
    /// pida autorización. El usuario la aprueba en una ventana de Windows; sin
    /// su «Sí» explícito no se agrega nada. false desactiva la ventana.
    /// </summary>
    public bool AllowPreviewApproval { get; set; } = true;

    public List<string> AllowedOrigins { get; set; } = new()
    {
        "https://go.ventalink.app",
        "https://go.walinka.com",
    };

    public static ConnectorConfig LoadOrCreate(string dataDir)
    {
        Directory.CreateDirectory(dataDir);
        var path = Path.Combine(dataDir, "config.json");
        if (!File.Exists(path))
        {
            var defaults = new ConnectorConfig();
            File.WriteAllText(path, JsonSerializer.Serialize(defaults, JsonOptions.Pretty));
            return defaults;
        }

        var loaded = JsonSerializer.Deserialize<ConnectorConfig>(File.ReadAllText(path))
            ?? throw new InvalidDataException($"config.json inválido en {path}.");
        var error = loaded.Validate();
        if (error is not null) throw new InvalidDataException($"config.json inválido: {error}");
        return loaded;
    }

    /// <summary>
    /// Comprueba config.json sin crearlo ni modificarlo. Devuelve null si está bien
    /// (o si no existe todavía: se creará con valores de producción).
    /// </summary>
    public static string? CheckFile(string dataDir)
    {
        var path = Path.Combine(dataDir, "config.json");
        if (!File.Exists(path)) return null;
        try
        {
            var loaded = JsonSerializer.Deserialize<ConnectorConfig>(File.ReadAllText(path));
            if (loaded is null) return $"config.json está vacío o no es válido: {path}";
            return loaded.Validate();
        }
        catch (JsonException ex)
        {
            return $"config.json tiene un error de formato (línea {ex.LineNumber?.ToString() ?? "?"}): {path}";
        }
        catch (IOException ex)
        {
            return $"no se pudo leer config.json: {ex.Message}";
        }
    }

    public string? Validate()
    {
        if (Port < 1024 || Port > 65535) return "el puerto debe estar entre 1024 y 65535.";
        if (AllowedOrigins.Count == 0) return "debe haber al menos un origen permitido.";
        foreach (var origin in AllowedOrigins)
        {
            if (origin.Contains('*')) return $"comodín no permitido en el origen: {origin}";
            if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return $"origen inválido: {origin}";
            var isHttps = uri.Scheme == Uri.UriSchemeHttps;
            var isLocalDev = uri.Scheme == Uri.UriSchemeHttp && uri.Host == "localhost";
            if (isLocalDev && !AllowLocalDevOrigin) return $"http://localhost solo se acepta con AllowLocalDevOrigin=true (desarrollo): {origin}";
            if (!isHttps && !isLocalDev) return $"origen debe ser https: {origin}";
            if (uri.AbsolutePath != "/" || !string.IsNullOrEmpty(uri.Query)) return $"el origen no puede tener ruta: {origin}";
        }
        return null;
    }
}

public static class JsonOptions
{
    public static readonly JsonSerializerOptions Pretty = new() { WriteIndented = true };
    public static readonly JsonSerializerOptions Lenient = new() { PropertyNameCaseInsensitive = true };
}
