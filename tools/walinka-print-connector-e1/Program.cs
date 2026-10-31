using System.Text;

namespace WalinkaPrintProbe;

// Prototipo E1 de Walinka Print Connector: impresión RAW, corte y cajón.
// Sin API HTTP, sin emparejamiento, sin ventas, sin boletas.
internal static class Program
{
    private const string Version = "0.1.0-e1";

    private static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        if (args.Length == 0 || args[0] is "-h" or "--help") return Help();

        try
        {
            return args[0] switch
            {
                "list" => List(),
                "bytes" => WriteTicketBytes(args),
                "test-print" => TestPrint(args),
                "drawer" => Drawer(args),
                "selftest" => SelfTest(),
                "version" => Version2(),
                _ => Fail($"Comando desconocido: {args[0]}. Usa --help."),
            };
        }
        catch (Spooler.SpoolerException ex)
        {
            return Fail(ex.Message);
        }
    }

    private static int Help()
    {
        Console.WriteLine($"""
        Walinka Print Connector — prototipo E1 ({Version})

        Comandos:
          list
              Lista las impresoras instaladas en Windows, con estado y si es la predeterminada.

          test-print --printer "NOMBRE" [--cut modern|legacy|none] [--force]
              Imprime un ticket de PRUEBA de 80 mm con corte. No es una venta.
              --cut: modern = GS V 66 0 (default, mismo que Walinka), legacy = GS V 1, none = sin corte.
              --force: envía aunque Windows reporte la impresora como sin conexión, sin papel o atascada.

          drawer --printer "NOMBRE" --confirm
              Envía el pulso del cajón ESC p. Sin --confirm no hace nada.
              No se llama automáticamente desde test-print.

          bytes --out ARCHIVO [--cut modern|legacy|none]
              Escribe el ticket de prueba como bytes en un archivo, sin imprimir.
              Sirve para revisar la secuencia exacta antes de enviarla.

          selftest
              Verifica las secuencias de bytes sin usar impresora.

          version
        """);
        return 0;
    }

    private static int Version2()
    {
        Console.WriteLine(Version);
        return 0;
    }

    private static int List()
    {
        var printers = Spooler.ListPrinters();
        if (printers.Count == 0)
        {
            Console.WriteLine("No hay impresoras instaladas en Windows.");
            return 0;
        }

        foreach (var p in printers)
        {
            var defaultMark = p.IsDefault ? " [predeterminada]" : string.Empty;
            Console.WriteLine($"- {p.Name}{defaultMark}");
            Console.WriteLine($"    Puerto: {p.Port} | Driver: {p.Driver} | Trabajos en cola: {p.Jobs}");
            var problems = Spooler.DescribeStatus(p.Status);
            if (problems.Count == 0)
            {
                Console.WriteLine("    Estado Windows: sin problemas reportados.");
            }
            else
            {
                foreach (var problem in problems) Console.WriteLine($"    Estado Windows: {problem}");
            }
        }
        return 0;
    }

    private static int WriteTicketBytes(string[] args)
    {
        var outPath = RequireOption(args, "--out");
        var cut = ParseCut(GetOption(args, "--cut") ?? "modern");
        var bytes = TicketBuilder.Build(cut, printerLabel: "(sin impresora: solo bytes)");
        File.WriteAllBytes(outPath, bytes);
        Console.WriteLine($"Ticket de prueba escrito en {Path.GetFullPath(outPath)} ({bytes.Length} bytes). No se imprimió nada.");
        return 0;
    }

    private static int TestPrint(string[] args)
    {
        var printerName = RequireOption(args, "--printer");
        var cut = ParseCut(GetOption(args, "--cut") ?? "modern");
        var force = args.Contains("--force");

        var printer = Spooler.FindPrinter(printerName);
        if (printer is null)
        {
            return Fail($"No existe una impresora llamada \"{printerName}\". Revisa el nombre con 'list'.");
        }

        var problems = Spooler.DescribeStatus(printer.Status);
        if (problems.Count > 0 && !force)
        {
            Console.WriteLine($"Windows reporta problemas con \"{printer.Name}\":");
            foreach (var problem in problems) Console.WriteLine($"  - {problem}");
            return Fail("No se envió nada. Revisa la impresora y vuelve a intentar, o usa --force si quieres probar igual.");
        }

        var bytes = TicketBuilder.Build(cut, printer.Name);
        Console.WriteLine($"Enviando ticket de prueba ({bytes.Length} bytes) a \"{printer.Name}\"...");
        Spooler.SendRaw(printer.Name, bytes, "Walinka E1 - prueba sin venta");

        Console.WriteLine();
        Console.WriteLine("Resultado: Windows ACEPTÓ el trabajo en la cola de impresión.");
        Console.WriteLine("Esto NO confirma que el papel se haya impreso ni cortado.");
        Console.WriteLine("Confirma visualmente: ¿salió el ticket completo? ¿Se cortó el papel? ¿Dice PRUEBA sin venta?");
        return 0;
    }

    private static int Drawer(string[] args)
    {
        var printerName = RequireOption(args, "--printer");
        if (!args.Contains("--confirm"))
        {
            Console.WriteLine("No se envió nada. El cajón solo se abre con --confirm.");
            return 0;
        }

        var printer = Spooler.FindPrinter(printerName)
            ?? throw new Spooler.SpoolerException($"No existe una impresora llamada \"{printerName}\".", 0);

        var bytes = EscPos.Concat(EscPos.Init, EscPos.DrawerPulse());
        Spooler.SendRaw(printer.Name, bytes, "Walinka E1 - pulso de cajón");
        Console.WriteLine("Pulso de cajón ESC p enviado a la cola. Verifica si el cajón se abrió.");
        Console.WriteLine("Windows aceptó el trabajo; no confirma la apertura física.");
        return 0;
    }

    private static int SelfTest()
    {
        var failures = new List<string>();

        void Check(bool ok, string name)
        {
            Console.WriteLine($"{(ok ? "OK  " : "FAIL")} {name}");
            if (!ok) failures.Add(name);
        }

        Check(EscPos.CutPartialModern.SequenceEqual(new byte[] { 0x1D, 0x56, 0x42, 0x00 }), "corte modern = GS V 66 0");
        Check(EscPos.CutPartialLegacy.SequenceEqual(new byte[] { 0x1D, 0x56, 0x01 }), "corte legacy = GS V 1");
        Check(EscPos.DrawerPulse().SequenceEqual(new byte[] { 0x1B, 0x70, 0x00, 0x19, 0xFA }), "cajón = ESC p 0 25 250");

        var ticket = TicketBuilder.Build(CutStyle.Modern, "TEST");
        Check(ContainsSequence(ticket, EscPos.CutPartialModern), "ticket con corte modern contiene GS V 66 0");
        Check(!ContainsSequence(ticket, EscPos.DrawerPulse()), "ticket de prueba NO contiene pulso de cajón");
        Check(ticket.Take(2).SequenceEqual(EscPos.Init), "ticket empieza con ESC @ (inicializar)");
        Check(ContainsSequence(TicketBuilder.Build(CutStyle.None, "TEST"), EscPos.CutPartialModern) == false, "cut none no emite corte");

        var text = Encoding.ASCII.GetString(EscPos.Text("Ñandú ✓"));
        Check(text == "?and? ?", "texto no ASCII se reemplaza por '?' (Ñandú ✓ -> ?and? ?)");

        Console.WriteLine(failures.Count == 0 ? "Todo OK." : $"{failures.Count} prueba(s) fallaron.");
        return failures.Count == 0 ? 0 : 1;
    }

    private static bool ContainsSequence(byte[] data, byte[] seq)
    {
        for (var i = 0; i + seq.Length <= data.Length; i++)
        {
            if (data.AsSpan(i, seq.Length).SequenceEqual(seq)) return true;
        }
        return false;
    }

    private static CutStyle ParseCut(string value) => value switch
    {
        "modern" => CutStyle.Modern,
        "legacy" => CutStyle.Legacy,
        "none" => CutStyle.None,
        _ => throw new ArgumentException($"--cut inválido: {value}. Usa modern, legacy o none."),
    };

    private static string RequireOption(string[] args, string name)
        => GetOption(args, name) ?? throw new ArgumentException($"Falta la opción {name}. Usa --help.");

    private static string? GetOption(string[] args, string name)
    {
        for (var i = 0; i < args.Length - 1; i++)
        {
            if (args[i] == name) return args[i + 1];
        }
        return null;
    }

    private static int Fail(string message)
    {
        Console.Error.WriteLine($"ERROR: {message}");
        return 1;
    }
}
