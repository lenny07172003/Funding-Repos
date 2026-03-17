"use client";

import Link from "next/link";
import {
  Beaker,
  Lightbulb,
  TrendingUp,
  Users,
  ChevronRight,
  ShoppingBag,
  Target,
  BarChart3,
  Rocket,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";

const services = [
  {
    icon: Beaker,
    title: "R&D Strategy",
    description:
      "Custom research and development strategies tailored to your company's goals and market position.",
  },
  {
    icon: TrendingUp,
    title: "Market Analysis",
    description:
      "Data-driven market research to identify opportunities and stay ahead of competitors.",
  },
  {
    icon: Target,
    title: "Brand Positioning",
    description:
      "Position your R&D company as an industry leader with targeted marketing campaigns.",
  },
  {
    icon: BarChart3,
    title: "Growth Marketing",
    description:
      "Scalable growth strategies that turn research breakthroughs into market success.",
  },
  {
    icon: Users,
    title: "Lead Generation",
    description:
      "Connect with decision-makers at companies seeking cutting-edge R&D partnerships.",
  },
  {
    icon: Lightbulb,
    title: "Innovation Consulting",
    description:
      "Transform your innovations into compelling narratives that attract investors and clients.",
  },
];

const stats = [
  { value: "150+", label: "R&D Clients Served" },
  { value: "$2.4B", label: "Revenue Generated" },
  { value: "98%", label: "Client Retention" },
  { value: "40+", label: "Industries Covered" },
];

const testimonials = [
  {
    quote:
      "Primetime Research transformed our go-to-market strategy. Our product launch exceeded projections by 300%.",
    name: "Dr. Sarah Chen",
    title: "CEO, BioNex Labs",
  },
  {
    quote:
      "Their understanding of the R&D space is unmatched. They speak our language and deliver real results.",
    name: "James Whitfield",
    title: "VP Marketing, Quantum Dynamics",
  },
  {
    quote:
      "From branding to lead gen, they handle it all. We can focus on research while they grow our business.",
    name: "Maria Rodriguez",
    title: "Founder, GreenTech Innovations",
  },
];

export default function PrimetimeResearchPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Rocket className="w-7 h-7 text-indigo-600" />
              <span className="text-xl font-bold text-gray-900">
                Primetime<span className="text-indigo-600">Research</span>
              </span>
            </div>
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
              <a href="#services" className="hover:text-indigo-600 transition-colors">
                Services
              </a>
              <a href="#about" className="hover:text-indigo-600 transition-colors">
                About
              </a>
              <a href="#testimonials" className="hover:text-indigo-600 transition-colors">
                Testimonials
              </a>
              <a href="#contact" className="hover:text-indigo-600 transition-colors">
                Contact
              </a>
              <Link
                href="/primetimeresearch/merch"
                className="flex items-center gap-1 hover:text-indigo-600 transition-colors"
              >
                <ShoppingBag className="w-4 h-4" />
                Merch Shop
              </Link>
            </div>
            <Link
              href="/primetimeresearch/merch"
              className="md:hidden flex items-center gap-1 text-sm font-medium text-indigo-600"
            >
              <ShoppingBag className="w-4 h-4" />
              Shop
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-purple-900 text-white">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-400 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-20 w-96 h-96 bg-purple-400 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 lg:py-40">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm text-indigo-200 mb-6">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              Trusted by 150+ R&D companies worldwide
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              Marketing That Fuels{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-300">
                Research & Innovation
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-indigo-100 mb-8 max-w-2xl">
              We help R&D companies turn groundbreaking research into market
              dominance. From strategy to execution, we are the growth engine
              behind the world&apos;s most innovative companies.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href="#contact"
                className="inline-flex items-center justify-center gap-2 bg-white text-indigo-900 px-6 py-3 rounded-lg font-semibold hover:bg-indigo-50 transition-colors"
              >
                Get Started
                <ChevronRight className="w-4 h-4" />
              </a>
              <a
                href="#services"
                className="inline-flex items-center justify-center gap-2 border border-white/30 text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors"
              >
                Our Services
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-gray-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-indigo-600">
                  {stat.value}
                </div>
                <div className="mt-1 text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Services Built for R&D
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              We understand the unique challenges of marketing research-driven
              companies. Our services are designed specifically for the R&D sector.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((service) => (
              <div
                key={service.title}
                className="group p-6 rounded-2xl border border-gray-200 hover:border-indigo-200 hover:shadow-lg transition-all duration-300"
              >
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-600 transition-colors">
                  <service.icon className="w-6 h-6 text-indigo-600 group-hover:text-white transition-colors" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {service.title}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  {service.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-20 sm:py-28 bg-indigo-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-6">
                Why R&D Companies Choose Us
              </h2>
              <p className="text-indigo-200 text-lg mb-8">
                We&apos;re not a generic marketing agency. Our team is composed
                of former scientists, engineers, and R&D professionals who
                transitioned into marketing. We understand your world because
                we&apos;ve lived it.
              </p>
              <ul className="space-y-4">
                {[
                  "Deep expertise in technical product marketing",
                  "Proven track record with biotech, cleantech, and deep tech",
                  "Full-service: strategy, content, digital, events, and PR",
                  "ROI-focused campaigns with transparent reporting",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-indigo-400 mt-0.5 flex-shrink-0" />
                    <span className="text-indigo-100">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-indigo-900/50 rounded-2xl p-8 border border-indigo-800">
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-indigo-800/50 rounded-xl p-6 text-center">
                  <div className="text-2xl font-bold text-white">12+</div>
                  <div className="text-sm text-indigo-300 mt-1">Years Experience</div>
                </div>
                <div className="bg-indigo-800/50 rounded-xl p-6 text-center">
                  <div className="text-2xl font-bold text-white">50+</div>
                  <div className="text-sm text-indigo-300 mt-1">Team Members</div>
                </div>
                <div className="bg-indigo-800/50 rounded-xl p-6 text-center">
                  <div className="text-2xl font-bold text-white">8</div>
                  <div className="text-sm text-indigo-300 mt-1">Global Offices</div>
                </div>
                <div className="bg-indigo-800/50 rounded-xl p-6 text-center">
                  <div className="text-2xl font-bold text-white">25+</div>
                  <div className="text-sm text-indigo-300 mt-1">Awards Won</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              What Our Clients Say
            </h2>
            <p className="text-lg text-gray-500">
              Hear from R&D leaders who transformed their growth with us.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="bg-gray-50 rounded-2xl p-8 border border-gray-100"
              >
                <p className="text-gray-600 italic mb-6">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div>
                  <div className="font-semibold text-gray-900">{t.name}</div>
                  <div className="text-sm text-gray-500">{t.title}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Merch CTA Banner */}
      <section className="bg-gradient-to-r from-purple-600 to-indigo-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="text-white text-center sm:text-left">
              <h3 className="text-2xl font-bold mb-2">
                Rep the Research Revolution
              </h3>
              <p className="text-indigo-100">
                Check out our exclusive merch — tees, hoodies, mugs, and more.
              </p>
            </div>
            <Link
              href="/primetimeresearch/merch"
              className="inline-flex items-center gap-2 bg-white text-indigo-700 px-6 py-3 rounded-lg font-semibold hover:bg-indigo-50 transition-colors flex-shrink-0"
            >
              <ShoppingBag className="w-5 h-5" />
              Shop Merch
            </Link>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 sm:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                Let&apos;s Grow Together
              </h2>
              <p className="text-lg text-gray-500 mb-8">
                Ready to accelerate your R&D company&apos;s growth? Get in touch
                and let&apos;s build a marketing strategy that matches your
                ambition.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-gray-600">
                  <Mail className="w-5 h-5 text-indigo-600" />
                  hello@primetimeresearch.com
                </div>
                <div className="flex items-center gap-3 text-gray-600">
                  <Phone className="w-5 h-5 text-indigo-600" />
                  (555) 123-4567
                </div>
                <div className="flex items-center gap-3 text-gray-600">
                  <MapPin className="w-5 h-5 text-indigo-600" />
                  123 Innovation Drive, San Francisco, CA 94105
                </div>
              </div>
            </div>
            <form
              onSubmit={(e) => e.preventDefault()}
              className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm"
            >
              <div className="space-y-5">
                <div>
                  <label className="label">Full Name</label>
                  <input type="text" className="input-field" placeholder="John Doe" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    className="input-field"
                    placeholder="john@company.com"
                  />
                </div>
                <div>
                  <label className="label">Company</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Your R&D Company"
                  />
                </div>
                <div>
                  <label className="label">Message</label>
                  <textarea
                    className="input-field"
                    rows={4}
                    placeholder="Tell us about your marketing goals..."
                  />
                </div>
                <button type="submit" className="btn-primary w-full">
                  Send Message
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-indigo-400" />
              <span className="text-white font-bold">
                Primetime<span className="text-indigo-400">Research</span>
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <a href="#services" className="hover:text-white transition-colors">
                Services
              </a>
              <a href="#about" className="hover:text-white transition-colors">
                About
              </a>
              <Link
                href="/primetimeresearch/merch"
                className="hover:text-white transition-colors"
              >
                Merch
              </Link>
              <a href="#contact" className="hover:text-white transition-colors">
                Contact
              </a>
            </div>
            <div className="text-sm">
              &copy; 2026 PrimetimeResearch. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
