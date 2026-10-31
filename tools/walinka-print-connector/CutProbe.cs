namespace WalinkaPrintProbe;

/// <summary>
/// Trabajos mínimos para aislar el corte. Cada variante es un job de pocas líneas,
/// con el mismo prefijo que usa Walinka (ESC @, ESC a 0, texto, LF) y una sola
/// secuencia de corte distinta. Sirven para comparar, no para imprimir ventas.
/// </summary>
public static class CutProbe
{
    public sealed record Variant(string Code, string Label, byte[]? Cut, string Note);

    public static readonly IReadOnlyList<Variant> Variants = new List<Variant>
    {
        new("T", "Solo texto, SIN comando de corte", null,
            "Diagnóstico del driver: si aparece una 'V' aquí, la cola o el driver está agregando bytes."),
        new("A", "GS V 66 0 (corte parcial, Walinka gs-v-modern)", EscPos.CutPartialModern,
            "Mismos bytes que el corte validado en producción con QZ."),
        new("B", "GS V 66 3 (avanza 3 líneas y corta parcial)", EscPos.CutPartialModeFeed(3),
            "Descarta que el corte necesite parámetro de avance."),
        new("C", "GS V 65 0 (corte total moderno, Walinka CUT_FULL)", EscPos.CutFullModern,
            "Si corta total y no parcial, el problema es la cuchilla parcial."),
        new("D", "GS V 0 (corte total legacy, 1 byte)", EscPos.CutFullLegacy,
            "Forma antigua de 1 byte; útil si el firmware solo entiende esta."),
        new("E", "GS V 1 (corte parcial legacy, 1 byte)", EscPos.CutPartialLegacy,
            "Igual a la variante usada en el prototipo anterior."),
    };

    public static Variant? Find(string code)
        => Variants.FirstOrDefault(v => string.Equals(v.Code, code, StringComparison.OrdinalIgnoreCase));

    public static byte[] Build(Variant variant, string printerLabel)
    {
        var parts = new List<byte[]>
        {
            EscPos.Init,
            EscPos.AlignLeft,
            EscPos.Line($"CORTE {variant.Code} - {variant.Label}"),
            EscPos.Line($"Impresora: {printerLabel}"),
            EscPos.Line($"Hora: {DateTime.Now:HH:mm:ss}"),
            EscPos.Line("PRUEBA DE CORTE - NO ES VENTA"),
            EscPos.LfRepeat(4),
        };
        if (variant.Cut is not null) parts.Add(variant.Cut);
        return EscPos.Concat(parts.ToArray());
    }
}
