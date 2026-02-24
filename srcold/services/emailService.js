// src/services/emailService.js
import emailjs from 'emailjs-com';
import { EMAIL_CONFIG } from '../config/googleSheets';

class EmailService {
  
  // Méthode utilitaire pour générer l'URL absolue du blason
  // Nécessaire pour que l'image s'affiche chez le destinataire
  getBlasonUrl() {
    // Récupère l'URL de base (ex: https://reservation.maurepas.fr)
    const baseUrl = window.location.origin;
    // Pointe vers l'image dans le dossier public/images/
    return `${baseUrl}/images/Blason_ville_MAUREPAS.png`;
  }

  // Envoyer un email de confirmation de réservation
  async sendConfirmation(reservation) {
    try {
      const templateParams = {
        to_email: reservation.email,
        to_name: `${reservation.prenom} ${reservation.nom}`,
        salle: reservation.salle,
        date_debut: reservation.dateDebut,
        heure_debut: reservation.heureDebut,
        date_fin: reservation.dateFin,
        heure_fin: reservation.heureFin,
        service: reservation.service,
        objet: reservation.objet,
        reservation_id: reservation.id,
        // ✅ AJOUT : URL du blason pour le template EmailJS
        blason_url: this.getBlasonUrl()
      };

      await emailjs.send(
        EMAIL_CONFIG.SERVICE_ID,
        EMAIL_CONFIG.TEMPLATE_ID_CONFIRMATION,
        templateParams,
        EMAIL_CONFIG.USER_ID
      );

      return { success: true };
    } catch (error) {
      console.error('Erreur lors de l\'envoi de l\'email de confirmation:', error);
      throw error;
    }
  }

  // Envoyer un email d'annulation de réservation par priorité
  async sendCancellation(reservation, raisonPriorite = '', adminEmail = '') {
    try {
      const templateParams = {
        to_email: reservation.email,
        to_name: `${reservation.prenom} ${reservation.nom}`,
        salle: reservation.salle,
        date_debut: reservation.dateDebut,
        heure_debut: reservation.heureDebut,
        date_fin: reservation.dateFin,
        heure_fin: reservation.heureFin,
        raison_priorite: raisonPriorite || 'Priorité administrative',
        admin_email: adminEmail || 'Administration',
        // ✅ AJOUT : URL du blason pour le template EmailJS
        blason_url: this.getBlasonUrl()
      };

      await emailjs.send(
        EMAIL_CONFIG.SERVICE_ID,
        EMAIL_CONFIG.TEMPLATE_ID_ANNULATION,
        templateParams,
        EMAIL_CONFIG.USER_ID
      );

      return { success: true };
    } catch (error) {
      console.error('Erreur lors de l\'envoi de l\'email d\'annulation:', error);
      throw error;
    }
  }

  // Initialiser EmailJS
  init() {
    emailjs.init(EMAIL_CONFIG.USER_ID);
  }
}

export default new EmailService();