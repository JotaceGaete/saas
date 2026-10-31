namespace WalinkaPrintProbe;

public enum CutStyle { Modern, Legacy, None }

/// <summary>
/// Ticket de prueba de 80 mm. No contiene datos de venta, cliente, RUT ni montos.
/// Se marca explícitamente como prueba para que nadie lo confunda con un comprobante.
/// </summary>
public static class TicketBuilder
{
    public static byte[] Build(CutStyle cut, string printerLabel)
    {
        var parts = new List<byte[]>
        {
            EscPos.Init,
            EscPos.Line("================================"),
            EscPos.Line("WALINKA PRINT PROBE E1"),
            EscPos.Line("PRUEBA DE IMPRESION - NO ES VENTA"),
            EscPos.Line("No es boleta ni comprobante"),
            EscPos.Line("================================"),
            EscPos.Line($"Impresora: {printerLabel}"),
            EscPos.Line($"Fecha: {DateTime.Now:yyyy-MM-dd HH:mm:ss}"),
            EscPos.Line("--------------------------------"),
            EscPos.Line("Linea 1: texto normal ASCII"),
            EscPos.Line("Linea 2: 0123456789 ABCDEFGHIJ"),
            EscPos.Line("Linea 3: abcdefghijklmnopqrstuvwxyz"),
            EscPos.Line("--------------------------------"),
            EscPos.Line("Si ves este texto completo, la"),
            EscPos.Line("cola RAW llego a la impresora."),
            EscPos.Line("Verifica el corte al final."),
            EscPos.Feed(4),
        };

        switch (cut)
        {
            case CutStyle.Modern:
                parts.Add(EscPos.CutPartialModern);
                break;
            case CutStyle.Legacy:
                parts.Add(EscPos.CutPartialLegacy);
                break;
            case CutStyle.None:
                break;
        }

        return EscPos.Concat(parts.ToArray());
    }
}
