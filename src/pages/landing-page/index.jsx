import React, { useEffect } from "react";
import { collectVisitAttribution } from "../../utils/analytics";
import { recordSiteVisit } from "../../services/waBusinessService";

import LandingNavbar from "./components/LandingNavbar";
import HeroSection from "./components/HeroSection";
import HowItWorksSection from "./components/HowItWorksSection";
import BenefitsSection from "./components/BenefitsSection";
import TestimonialsSection from "./components/TestimonialsSection";
import CtaSection from "./components/CtaSection";
import LandingFooter from "./components/LandingFooter";

export default function LandingPage() {
  useEffect(() => {
    recordSiteVisit({ path: '/', attribution: collectVisitAttribution() }).catch(() => {});
  }, []);

  return (
    <div
      className="min-h-screen w-full max-w-full min-w-0 overflow-x-hidden"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      {/* Fixed navigation */}
      <LandingNavbar />

      {/* Main content */}
      <main role="main" className="w-full max-w-full min-w-0 overflow-x-hidden">
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