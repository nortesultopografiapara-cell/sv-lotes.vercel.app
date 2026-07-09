import { Calendar, Mail, MapPin, Phone, Shield } from 'lucide-react';
import { LANDING_CONTACT } from './constants/landingConfig';

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-container">
        <div className="landing-footer-grid">
          <div>
            <p className="text-lg font-bold text-white">SV TOPOGRAFIA E PROJETOS</p>
            <p className="text-sm text-gray-400 mt-2 max-w-sm">
              Mais de 15 anos de experiência em topografia, georreferenciamento, projetos e gestão
              territorial.
            </p>
          </div>
          <div className="landing-footer-info">
            <span>
              <Calendar className="w-4 h-4 text-brand" />
              Fundação: {LANDING_CONTACT.founded}
            </span>
            <span>
              <Shield className="w-4 h-4 text-brand" />
              CNPJ: {LANDING_CONTACT.cnpj}
            </span>
            <span>
              <MapPin className="w-4 h-4 text-brand" />
              Parauapebas – PA
            </span>
            <span>
              <Mail className="w-4 h-4 text-brand" />
              {LANDING_CONTACT.email}
            </span>
            <span>
              <Mail className="w-4 h-4 text-brand" />
              Suporte Técnico: {LANDING_CONTACT.supportEmail}
            </span>
            <span>
              <Phone className="w-4 h-4 text-brand" />
              {LANDING_CONTACT.phone}
            </span>
          </div>
        </div>
        <p className="landing-footer-copy">© {new Date().getFullYear()} SV LOTES. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}
