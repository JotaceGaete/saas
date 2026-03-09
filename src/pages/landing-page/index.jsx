import React from "react";

import LandingNavbar from "./components/LandingNavbar";
import HeroSection from "./components/HeroSection";
import HowItWorksSection from "./components/HowItWorksSection";
import BenefitsSection from "./components/BenefitsSection";
import TestimonialsSection from "./components/TestimonialsSection";
import CtaSection from "./components/CtaSection";
import LandingFooter from "./components/LandingFooter";

export default function LandingPage() {
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      {/* Fixed navigation */}
      <LandingNavbar />

      {/* Main content */}
      <main role="main">
        {/* Hero */}
        <HeroSection />

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
        <CtaSection />
      </main>

      {/* Footer */}
      <LandingFooter />
    </div>
  );
}