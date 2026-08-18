'use client';

import { useState } from 'react';
import {
  Calendar,
  Clock,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
} from 'lucide-react';
import {
  buildContactFormMailto,
  buildContactFormWhatsAppMessage,
  buildWhatsAppUrl,
  LANDING_ADDRESS,
  LANDING_CONTACT,
  LANDING_GOOGLE_MAPS_DIRECTIONS_URL,
  LANDING_GOOGLE_MAPS_URL,
  LANDING_PHONE_NUMBER,
  LANDING_WHATSAPP_MESSAGES,
  handleLandingWhatsAppClick,
  openLandingWhatsApp,
  validateContactForm,
  type ContactFormFieldErrors,
} from '../constants/landingConfig';
import {
  trackClickWhatsApp,
  trackEnviarFormulario,
  trackSolicitarDemonstracao,
} from '@/lib/analytics';
import { Reveal } from '../LandingMotion';

const PLANS = ['Básico', 'Business', 'Profissional', 'Ainda não sei'];

const EMPTY_FORM = {
  name: '',
  company: '',
  phone: '',
  email: '',
  city: '',
  plan: 'Ainda não sei',
  message: '',
};

export function ContactSection() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<ContactFormFieldErrors>({});

  const runValidation = () => {
    const nextErrors = validateContactForm(form);
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleWhatsApp = (source: 'demonstracao' | 'whatsapp' | 'email_fallback' = 'whatsapp') => {
    if (!runValidation()) return;
    if (source === 'demonstracao') {
      trackSolicitarDemonstracao({ form: 'contact', channel: 'whatsapp' });
      trackEnviarFormulario({ form: 'contact', channel: 'whatsapp' });
    } else {
      trackClickWhatsApp({ form: 'contact', channel: 'whatsapp' });
      trackEnviarFormulario({ form: 'contact', channel: 'whatsapp' });
    }
    const urlOk = openLandingWhatsApp(buildContactFormWhatsAppMessage(form));
    if (!urlOk) return;
  };

  const handleEmail = () => {
    if (!runValidation()) return;
    trackEnviarFormulario({ form: 'contact', channel: 'email' });
    trackSolicitarDemonstracao({ form: 'contact', channel: 'email' });
    window.location.href = buildContactFormMailto(form);
  };

  const fieldClass = (field: keyof ContactFormFieldErrors) =>
    errors[field] ? 'landing-contact-form-field--error' : '';

  return (
    <section id="contato" className="landing-section landing-contact landing-contact-v3">
      <div className="landing-container">
        <Reveal className="landing-contact-head">
          <span className="landing-pill">Contato</span>
          <h2 className="landing-section-title">
            Pronto para transformar a gestão do seu loteamento?
          </h2>
          <p className="landing-section-subtitle">
            Converse com nossa equipe e veja como o SV LOTES pode funcionar na sua operação.
          </p>
        </Reveal>

        <div className="landing-contact-grid">
          <Reveal className="landing-contact-main">
            <div className="landing-contact-form">
              <h3 className="text-lg font-bold text-white mb-4">Solicitar demonstração</h3>
              <div className="landing-form-grid">
                <label>
                  Nome
                  <input
                    value={form.name}
                    onChange={(e) => {
                      setForm({ ...form, name: e.target.value });
                      if (errors.name) setErrors({ ...errors, name: undefined });
                    }}
                    placeholder="Seu nome"
                    className={fieldClass('name')}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? 'contact-error-name' : undefined}
                  />
                  {errors.name ? (
                    <span id="contact-error-name" className="landing-contact-form-error">
                      {errors.name}
                    </span>
                  ) : null}
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
                    value={form.phone}
                    onChange={(e) => {
                      setForm({ ...form, phone: e.target.value });
                      if (errors.phone) setErrors({ ...errors, phone: undefined });
                    }}
                    placeholder="(94) 99999-9999"
                    className={fieldClass('phone')}
                    aria-invalid={Boolean(errors.phone)}
                    aria-describedby={errors.phone ? 'contact-error-phone' : undefined}
                  />
                  {errors.phone ? (
                    <span id="contact-error-phone" className="landing-contact-form-error">
                      {errors.phone}
                    </span>
                  ) : null}
                </label>
                <label>
                  Cidade/estado
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="Parauapebas – PA"
                  />
                </label>
                <label>
                  E-mail <span className="landing-muted text-xs">(opcional)</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="seu@email.com"
                  />
                </label>
                <label>
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
                    onChange={(e) => {
                      setForm({ ...form, message: e.target.value });
                      if (errors.message) setErrors({ ...errors, message: undefined });
                    }}
                    placeholder="Conte brevemente sobre seu loteamento"
                    className={fieldClass('message')}
                    aria-invalid={Boolean(errors.message)}
                    aria-describedby={errors.message ? 'contact-error-message' : undefined}
                  />
                  {errors.message ? (
                    <span id="contact-error-message" className="landing-contact-form-error">
                      {errors.message}
                    </span>
                  ) : null}
                </label>
              </div>

              <div className="landing-contact-form-actions">
                <button
                  type="button"
                  id="submit_demonstracao"
                  data-cta="submit_demonstracao"
                  onClick={() => handleWhatsApp('demonstracao')}
                  className="landing-btn-primary landing-contact-form-btn landing-btn-interactive"
                >
                  <Calendar className="w-4 h-4" aria-hidden />
                  Agendar demonstração
                </button>
                <button
                  type="button"
                  onClick={() => handleWhatsApp('whatsapp')}
                  className="landing-btn-whatsapp landing-contact-form-btn landing-btn-interactive"
                >
                  <MessageCircle className="w-4 h-4" aria-hidden />
                  Chamar no WhatsApp
                </button>
                <button
                  type="button"
                  onClick={handleEmail}
                  className="landing-btn-system landing-contact-form-btn landing-btn-interactive"
                >
                  <Mail className="w-4 h-4" aria-hidden />
                  Enviar por E-mail
                </button>
              </div>
            </div>

            <div className="landing-map-wrap landing-map-wrap--lg mt-6">
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
                  className="landing-btn-outline text-xs py-2 landing-btn-interactive"
                  aria-label="Abrir no Google Maps"
                >
                  <MapPin className="w-4 h-4" />
                  Abrir no Google Maps
                </a>
                <a
                  href={LANDING_GOOGLE_MAPS_DIRECTIONS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="landing-btn-outline text-xs py-2 landing-btn-interactive"
                  aria-label="Traçar rota no Google Maps"
                >
                  <Navigation className="w-4 h-4" />
                  Traçar rota
                </a>
              </div>
            </div>
          </Reveal>

          <Reveal className="landing-contact-sidebar" delay={0.06}>
            <a
              href={buildWhatsAppUrl(LANDING_WHATSAPP_MESSAGES.demo, 'desktop')}
              target="_blank"
              rel="noopener noreferrer"
              className="landing-contact-whatsapp-card"
              onClick={(event) =>
                handleLandingWhatsAppClick(event, LANDING_WHATSAPP_MESSAGES.demo)
              }
            >
              <MessageCircle className="w-8 h-8" />
              <div>
                <p className="font-bold text-white">WhatsApp direto</p>
                <p className="text-sm opacity-90">Resposta rápida no horário comercial</p>
              </div>
            </a>

            <h3 className="text-lg font-bold text-white mb-4 mt-6">Nossos contatos</h3>
            <ul className="landing-contact-list">
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
                      href={buildWhatsAppUrl(LANDING_WHATSAPP_MESSAGES.contact, 'desktop')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm text-gray-400 hover:text-white"
                      onClick={(event) =>
                        handleLandingWhatsAppClick(event, LANDING_WHATSAPP_MESSAGES.contact)
                      }
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
                <Mail className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-medium text-white">Suporte Técnico</p>
                  <a
                    href={`mailto:${LANDING_CONTACT.supportEmail}`}
                    className="text-sm text-gray-400 hover:text-white"
                  >
                    {LANDING_CONTACT.supportEmail}
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
              <li>
                <MapPin className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-medium text-white">Endereço</p>
                  <p className="text-sm text-gray-400">{LANDING_ADDRESS.full}</p>
                </div>
              </li>
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
