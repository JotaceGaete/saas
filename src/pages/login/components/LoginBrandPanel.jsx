import React from 'react';
import VentalinkLogo from 'components/branding/VentalinkLogo';

const Feature = ({ children }) => (
  <span className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium text-white/90 backdrop-blur-sm">{children}</span>
);

export default function LoginBrandPanel() {
  return (
    <aside className="relative hidden min-h-screen overflow-hidden bg-[#4c0d91] text-white lg:flex lg:w-[53%] lg:flex-col lg:justify-between xl:w-[56%]">
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 -top-48 h-[580px] w-[580px] rounded-full bg-fuchsia-500/25 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 -right-32 h-[540px] w-[540px] rounded-full bg-violet-400/25 blur-3xl" />
      <div className="relative z-10 mx-auto flex w-full max-w-[820px] flex-1 flex-col px-9 pb-9 pt-10 xl:px-14 xl:pt-12">
        <div className="mb-9 flex items-center justify-start">
          <VentalinkLogo variant="white" width={220} className="max-w-[220px]" />
        </div>
        <div className="mb-7">
          <span className="inline-flex rounded-full border border-white/15 bg-white/15 px-4 py-2 text-xs font-semibold tracking-wide text-white/95">Software para negocios</span>
          <h2 className="mt-5 max-w-[680px] text-4xl font-extrabold leading-[1.08] tracking-tight text-white xl:text-5xl 2xl:text-[58px]">
            Tu negocio, <span className="text-fuchsia-200">bajo control.</span>
          </h2>
          <p className="mt-5 max-w-[590px] text-base leading-relaxed text-violet-100 xl:text-lg">
            Vende en tu local y por internet. Gestiona tus ventas, controla tus gastos y conoce cómo marcha tu negocio, todo desde Walinka.
          </p>
        </div>

        <div className="relative mx-auto mt-4 w-full max-w-[680px] pb-20 pt-3 xl:mt-8" aria-label="Vista ilustrativa de las funciones de Walinka">
          <div className="w-[85%] rotate-[-2deg] overflow-hidden rounded-[22px] border-[6px] border-violet-200/80 bg-[#f6f7fc] shadow-[0_28px_70px_rgba(18,5,45,.4)]">
            <div className="flex items-center gap-1.5 border-b border-slate-200 bg-white px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="ml-3 text-[11px] font-bold text-violet-700">Walinka · Informes</span>
            </div>
            <div className="p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap gap-1.5 text-[9px] text-slate-600">
                {['Hoy', 'Ayer', 'Esta semana', 'Este mes'].map((item) => <span key={item} className={`rounded-full px-2.5 py-1 ${item === 'Este mes' ? 'bg-slate-900 text-white' : 'bg-white'}`}>{item}</span>)}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[['VENTAS NETAS', '$273.300', 'text-blue-600'], ['DINERO RECIBIDO', '$265.300', 'text-emerald-600'], ['GASTOS', '$0', 'text-rose-500']].map(([label, value, color]) => (
                  <div key={label} className="rounded-xl bg-white p-2.5 shadow-sm sm:p-3">
                    <div className="text-[8px] font-semibold text-slate-400 sm:text-[9px]">{label}</div>
                    <div className={`mt-1 text-sm font-extrabold sm:text-lg ${color}`}>{value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-xl bg-white p-4 shadow-sm">
                <div className="text-xs font-bold text-slate-800">Ventas por día</div>
                <div className="mt-4 flex h-28 items-end gap-3 border-b border-slate-100 pb-1">
                  {[82, 55, 68, 40, 76, 49, 90, 60, 74, 51, 85, 66].map((height, index) => (
                    <span key={index} className="flex-1 rounded-t bg-emerald-500/80" style={{ height: `${height}%`, opacity: index % 3 === 0 ? 1 : 0.35 }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="absolute right-0 top-0 w-[33%] min-w-[150px] rotate-[3deg] rounded-[29px] border-[6px] border-[#211535] bg-white p-2.5 text-slate-900 shadow-[0_25px_55px_rgba(17,4,36,.55)]">
            <div className="mb-3 text-center text-[9px] font-semibold text-violet-500">Catálogo online</div>
            <div className="mb-2 rounded-lg bg-violet-50 px-2 py-2 text-center text-[10px] font-bold">Mi negocio</div>
            {[['ABONO TI...', '$10.000'], ['ROPA 20', '$20.000'], ['ARREGLO...', '$8.000']].map(([name, price]) => (
              <div key={name} className="mb-2 flex items-center gap-2 rounded-lg border border-violet-100 p-1.5">
                <div className="h-9 w-9 flex-shrink-0 rounded-md bg-violet-100" />
                <div className="min-w-0 flex-1"><div className="truncate text-[9px] font-bold">{name}</div><div className="text-[9px] font-bold text-pink-600">{price}</div></div>
                <span className="rounded bg-pink-600 px-1.5 text-xs text-white">+</span>
              </div>
            ))}
            <div className="mt-3 rounded-lg bg-gradient-to-r from-pink-600 to-violet-700 py-2 text-center text-[9px] font-semibold text-white">Ver pedido</div>
          </div>
          <div className="absolute bottom-0 left-[28%] w-[52%] rotate-[-2deg] rounded-2xl border-4 border-violet-100 bg-white p-3 text-slate-900 shadow-[0_18px_40px_rgba(24,5,55,.35)] sm:p-4">
            <div className="text-[10px] font-bold sm:text-xs">Termómetro del negocio</div>
            <div className="mt-1 text-[9px] text-slate-500">Resultado operativo estimado</div>
            <div className="mt-2 text-lg font-extrabold text-emerald-600 sm:text-2xl">+$273.300</div>
          </div>
        </div>
        <div className="mt-auto flex flex-wrap gap-2 pt-9">
          <Feature>Catálogo online</Feature><Feature>Informes de ventas</Feature><Feature>Gestión de pedidos</Feature><Feature>Control de gastos</Feature>
        </div>
        <p className="mt-3 text-[10px] text-violet-200/70">Vista ilustrativa basada en las herramientas de Walinka. Los importes son ejemplos.</p>
      </div>
    </aside>
  );
}
