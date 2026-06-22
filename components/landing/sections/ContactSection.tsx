'use client';

import { useState } from 'react';
import {
  Calendar,
  Clock,
  Headphones,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Shield,
} from 'lucide-react';
import {
  buildContactFormWhatsApp,
  buildWhatsAppUrl,
  LANDING_ADDRESS,
  LANDING_CONTACT,
  LANDING_GOOGLE_MAPS_DIRECTIONS_URL,
  LANDING_GOOGLE_MAPS_URL,
  LANDING_PHONE_NUMBER,
  LANDING_WHATSAPP_MESSAGES,
} from '../constants/landingConfig';

const PLANS = ['Básico', 'Business', 'Profissional', 'Ainda não sei'];

export function ContactSection() {
  const [form, setForm] = useState({
    name: '',
    company: '',
    phone: '',
    email: '',
    plan: 'Ainda não sei',
    message: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = buildContactFormWhatsApp(form);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <section id="contato" className="landing-section landing-contact">
      <div className="landing-container">
        <div className="landing-contact-head">
          <span className="landing-pill">Entre em Contato</span>
          <h2 className="landing-section-title">
            Estamos prontos para <span className="text-brand">atender você!</span>
          </h2>
          <p className="landing-section-subtitle">
            Fale conosco e descubra como o SV LOTES pode transformar a gestão do seu loteamento ou
            empreendimento.
          </p>
        </div>

        <div className="landing-contact-grid">
          <div className="landing-contact-main">
            <div className="landing-contact-highlights">
              <div>
                <Headphones className="w-5 h-5 text-brand" />
                <div>
                  <p className="font-semibold text-white text-sm">Atendimento especializado</p>
                  <p className="text-xs text-gray-400">Profissionais que entendem do seu negócio.</p>
                </div>
              </div>
              <div>
                <Shield className="w-5 h-5 text-emerald-400" />
                <div>
                  <p className="font-semibold text-white text-sm">Resposta rápida</p>
                  <p className="text-xs text-gray-400">Retorno em horário comercial.</p>
                </div>
              </div>
            </div>

            <div className="landing-map-wrap">
              <iframe
                title="Localização SV Topografia - Parauapebas PA"
                src={`https://maps.google.com/maps?q=${LANDING_ADDRESS.lat},${LANDING_ADDRESS.lng}&z=16&output=embed`}
                className="landing-map-iframe"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <div className="landing-map-actions">
                <a
                  href={LANDING_GOOGLE_MAPS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="landing-btn-outline text-xs py-2"
                  aria-label="Abrir no Google Maps"
                >
                  <MapPin className="w-4 h-4" />
                  Abrir no Google Maps
                </a>
                <a
                  href={LANDING_GOOGLE_MAPS_DIRECTIONS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="landing-btn-outline text-xs py-2"
                  aria-label="Traçar rota no Google Maps"
                >
                  <Navigation className="w-4 h-4" />
                  Traçar rota
                </a>
              </div>
              <div className="landing-map-coords">
                <p>{LANDING_ADDRESS.full}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Lat: {LANDING_ADDRESS.lat} · Long: {LANDING_ADDRESS.lng}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="landing-contact-form">
              <h3 className="text-lg font-bold text-white mb-4">Envie sua mensagem</h3>
              <div className="landing-form-grid">
                <label>
                  Nome
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Seu nome"
                  />
                </label>
                <label>
                  Empresa
                  <input
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    placeholder="Nome da empresa"
                  />
                </label>
                <label>
                  WhatsApp
                  <input
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="(94) 99999-9999"
                  />
                </label>
                <label>
                  E-mail
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="seu@email.com"
                  />
                </label>
                <label className="sm:col-span-2">
                  Plano de interesse
                  <select
                    value={form.plan}
                    onChange={(e) => setForm({ ...form, plan: e.target.value })}
                  >
                    {PLANS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sm:col-span-2">
                  Mensagem
                  <textarea
                    rows={3}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Como podemos ajudar?"
                  />
                </label>
              </div>
              <button type="submit" className="landing-btn-primary w-full justify-center mt-4">
                <MessageCircle className="w-4 h-4" />
                Enviar via WhatsApp
              </button>
            </form>
          </div>

          <aside className="landing-contact-sidebar">
            <h3 className="text-lg font-bold text-white mb-4">Nossos contatos</h3>
            <ul className="landing-contact-list">
              <li>
                <MapPin className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-medium text-white">Endereço</p>
                  <p className="text-sm text-gray-400">{LANDING_ADDRESS.street}</p>
                  <p className="text-sm text-gray-400">{LANDING_ADDRESS.neighborhood}</p>
                  <p className="text-sm text-gray-400">
                    {LANDING_ADDRESS.city} · CEP: {LANDING_ADDRESS.cep}
                  </p>
                </div>
              </li>
              <li>
                <Phone className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-medium text-white">Telefone</p>
                  <a href={`tel:+${LANDING_PHONE_NUMBER}`} className="text-sm text-gray-400 hover:text-white">
                    {LANDING_CONTACT.phone}
                  </a>
                </div>
              </li>
              <li>
                <MessageCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-medium text-white">WhatsApp</p>
                  {LANDING_CONTACT.whatsapp.map((w) => (
                    <a
                      key={w}
                      href={buildWhatsAppUrl(LANDING_WHATSAPP_MESSAGES.contact)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm text-gray-400 hover:text-white"
                    >
                      {w}
                    </a>
                  ))}
                </div>
              </li>
              <li>
                <Mail className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-medium text-white">E-mail</p>
                  <a href={`mailto:${LANDING_CONTACT.email}`} className="text-sm text-gray-400 hover:text-white">
                    {LANDING_CONTACT.email}
                  </a>
                </div>
              </li>
              <li>
                <Clock className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-medium text-white">Horário</p>
                  <p className="text-sm text-gray-400">{LANDING_CONTACT.hours}</p>
                </div>
              </li>
            </ul>
            <a
              href={buildWhatsAppUrl(LANDING_WHATSAPP_MESSAGES.demo)}
              target="_blank"
              rel="noopener noreferrer"
              className="landing-btn-primary w-full justify-center mt-6"
              aria-label="Agendar demonstração"
            >
              <Calendar className="w-4 h-4" />
              Agendar Demonstração
            </a>
          </aside>
        </div>
      </div>
    </section>
  );
}
