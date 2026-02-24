import React from 'react';

/**
 * Pied de page de l'application
 * Informations légales, contacts, version
 */
const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="main-footer">
      <style>{`
        /* Responsive uniquement : 2 blocs sur une seule ligne */
        @media (max-width: 900px){
          .main-footer .footer-content{
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
            gap: 10px !important;
            align-items: start !important;
          }
          .main-footer .footer-content .footer-section{ min-width: 0 !important; }
          .main-footer .footer-content .footer-section:nth-child(3),
          .main-footer .footer-content .footer-section:nth-child(4){
            display: none !important;
          }
        }
      `}</style>
      <div className="footer-content">
        <div className="footer-section">
          <h4>⚖️ Conformité légale</h4>
          <p>
            Application conforme au Code électoral français<br />
            Élections municipales et communautaires<br />
            Décret n° 2001-213 du 8 mars 2001
          </p>
        </div>

        <div className="footer-section">
          <h4>📞 Support technique</h4>
          <p>
            DSI - Mairie de Maurepas<br />
			📧 j.matrat@maurepas.fr <br />
            📞 <strong>06 79 93 18 91</strong>
		 </p>
        </div>

        <div className="footer-section">
          <h4>🔐 Sécurité & Traçabilité</h4>
          <p>
            Toutes les actions sont tracées<br />
            Audit complet disponible<br />
            Données sécurisées<br />
          </p>
        </div>

        <div className="footer-section">
          <h4>ℹ️ Informations</h4>
          <p>
            Version 4.6.7<br />
            Premier tour : 15 mars 2026<br />
            Second tour : 22 mars 2026
          </p>
        </div>
      </div>

      <div className="footer-bottom">
        <p>
          © {currentYear} - DSI - Mairie de MAUREPAS - Tous droits réservés<br />
          Application développée par la DSI pour les élections municipales 2026
        </p>
      </div>
    </footer>
  );
};

export default Footer;
