namespace WalinkaPrintConnector;

/// <summary>
/// Validación estructural del flujo ESC/POS antes de enviarlo a la cola de Windows.
///
/// No busca secuencias de bytes en el flujo completo: recorre el trabajo comando por
/// comando, con la longitud que cada comando declara. Así los datos binarios de imagen
/// (ESC * y GS v 0) se consumen tal cual y nunca se interpretan como comandos, y un
/// ESC p (cajón) fuera de esos datos se rechaza.
///
/// Solo se admite el subconjunto que emite Walinka (renderEscPosReceipt.js, escPosImage.js)
/// más los comandos de corte y avance del conector. Todo lo demás se rechaza.
/// </summary>
public static class EscPosStreamValidator
{
    // Códigos de error estables (se registran en la auditoría).
    public const string Truncated = "escpos_truncated";
    public const string UnknownCommand = "escpos_unknown_command";
    public const string DrawerBlocked = "escpos_drawer_blocked";
    public const string BadParameter = "escpos_bad_parameter";
    public const string ControlNotAllowed = "escpos_control_not_allowed";

    /// <summary>Devuelve null si el flujo es válido; si no, un código de error y la posición.</summary>
    public static (string? Error, int Offset) Validate(ReadOnlySpan<byte> data)
    {
        int i = 0;
        while (i < data.Length)
        {
            byte b = data[i];

            // Texto imprimible (ASCII y code pages 0x80-0xFF) y salto de línea.
            if (b == 0x0A || (b >= 0x20 && b <= 0x7E) || b >= 0x80)
            {
                i++;
                continue;
            }

            int consumed;
            string? error;
            switch (b)
            {
                case 0x1B: // ESC
                    (consumed, error) = ValidateEsc(data, i);
                    break;
                case 0x1D: // GS
                    (consumed, error) = ValidateGs(data, i);
                    break;
                default:
                    // Cualquier otro control (DLE, FS, NUL, CR, TAB...) no se usa en Walinka.
                    return (ControlNotAllowed, i);
            }

            if (error is not null) return (error, i);
            i += consumed;
        }
        return (null, data.Length);
    }

    private static (int Consumed, string? Error) ValidateEsc(ReadOnlySpan<byte> data, int at)
    {
        if (!Has(data, at, 2)) return (0, Truncated);
        byte cmd = data[at + 1];
        switch (cmd)
        {
            case 0x40: // ESC @ — inicializar
            case 0x32: // ESC 2 — espaciado por defecto
                return (2, null);

            case 0x70: // ESC p — pulso de cajón portamonedas. Nunca permitido.
                return (0, DrawerBlocked);

            case 0x61: // ESC a n — alineación 0/1/2
                if (!Has(data, at, 3)) return (0, Truncated);
                return data[at + 2] <= 2 ? (3, null) : (0, BadParameter);

            case 0x45: // ESC E n — negrita 0/1
                if (!Has(data, at, 3)) return (0, Truncated);
                return data[at + 2] <= 1 ? (3, null) : (0, BadParameter);

            case 0x33: // ESC 3 n — interlineado (cualquier valor)
            case 0x64: // ESC d n — avance de n líneas (usado por las pruebas de corte del conector)
                if (!Has(data, at, 3)) return (0, Truncated);
                return (3, null);

            case 0x24: // ESC $ nL nH — posición absoluta (diagnósticos de logo)
                if (!Has(data, at, 4)) return (0, Truncated);
                return (4, null);

            case 0x2A: // ESC * m nL nH d1...dk — imagen de mapa de bits
            {
                if (!Has(data, at, 5)) return (0, Truncated);
                byte m = data[at + 2];
                int bytesPerColumn = m switch
                {
                    0x00 or 0x01 => 1,   // 8 puntos verticales
                    0x20 or 0x21 => 3,   // 24 puntos verticales
                    _ => -1,
                };
                if (bytesPerColumn < 0) return (0, BadParameter);
                int columns = data[at + 3] | (data[at + 4] << 8);
                int payload = columns * bytesPerColumn;
                if (!Has(data, at, 5 + payload)) return (0, Truncated);
                return (5 + payload, null);
            }

            default:
                return (0, UnknownCommand);
        }
    }

    private static (int Consumed, string? Error) ValidateGs(ReadOnlySpan<byte> data, int at)
    {
        if (!Has(data, at, 2)) return (0, Truncated);
        byte cmd = data[at + 1];
        switch (cmd)
        {
            case 0x21: // GS ! n — tamaño de caracteres: normal, doble alto, doble ancho, ambos
                if (!Has(data, at, 3)) return (0, Truncated);
                return data[at + 2] is 0x00 or 0x01 or 0x10 or 0x11 ? (3, null) : (0, BadParameter);

            case 0x56: // GS V — corte
            {
                if (!Has(data, at, 3)) return (0, Truncated);
                byte m = data[at + 2];
                switch (m)
                {
                    case 0x00: case 0x01: case 0x30: case 0x31: // corte total/parcial sin parámetro
                        return (3, null);
                    case 0x41: case 0x42: // corte modo moderno: GS V 65|66 n
                        if (!Has(data, at, 4)) return (0, Truncated);
                        return (4, null);
                    default:
                        return (0, BadParameter);
                }
            }

            case 0x76: // GS v 0 m xL xH yL yH d1...dk — raster
            {
                if (!Has(data, at, 3)) return (0, Truncated);
                if (data[at + 2] != 0x30) return (0, UnknownCommand); // GS v 0 es el único subcomando
                if (!Has(data, at, 4)) return (0, Truncated);
                if (data[at + 3] != 0x00) return (0, BadParameter); // modo normal (sin escalado)
                if (!Has(data, at, 8)) return (0, Truncated);
                int bytesPerRow = data[at + 4] | (data[at + 5] << 8);
                int rows = data[at + 6] | (data[at + 7] << 8);
                int payload = bytesPerRow * rows;
                if (!Has(data, at, 8 + payload)) return (0, Truncated);
                return (8 + payload, null);
            }

            default:
                return (0, UnknownCommand);
        }
    }

    private static bool Has(ReadOnlySpan<byte> data, int at, int length) => at + length <= data.Length;
}
