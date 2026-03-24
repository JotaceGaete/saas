import React, { useState } from "react";

import LandingNavbar from "./components/LandingNavbar";
import HeroSection from "./components/HeroSection";
import HowItWorksSection from "./components/HowItWorksSection";
import BenefitsSection from "./components/BenefitsSection";
import TestimonialsSection from "./components/TestimonialsSection";
import CtaSection from "./components/CtaSection";
import LandingFooter from "./components/LandingFooter";
import MarketEntryModal from "./components/MarketEntryModal";

export default function LandingPage() {
  const [marketModalOpen, setMarketModalOpen] = useState(false);

  return (
    <div
      className="min-h-screen w-full max-w-full min-w-0 overflow-x-hidden"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <MarketEntryModal open={marketModalOpen} onClose={() => setMarketModalOpen(false)} />

      {/* Fixed navigation */}
      <LandingNavbar onOpenRegister={() => setMarketModalOpen(true)} />

      {/* Main content */}
      <main role="main" className="w-full max-w-full min-w-0 overflow-x-hidden">
        {/* Hero */}
        <HeroSection onOpenRegister={() => setMarketModalOpen(true)} />

        {/* How it works */}
        <section id="como-funciona">
          <HowItWorksSection />
        </section>

        {/* Benefits */}
        <section id="beneficios">
          <BenefitsSection />
        </section>

        {/* Testimonials */}
        <section id="testimonios">
          <TestimonialsSection />
        </section>

        {/* Final CTA */}
        <CtaSection onOpenRegister={() => setMarketModalOpen(true)} />
      </main>

      {/* Footer */}
      <LandingFooter />
    </div>
  );
}