// src/services/icalService.js
// CORRECTION : Format .ics optimisé pour ajout au calendrier par défaut avec rappel 15 min

const icalService = {
  /**
   * Formate une date JS en chaîne iCal avec fuseau horaire
   * Format : YYYYMMDDTHHmm00
   */
  formatDateToIcalString: (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return '';
    const [year, month, day] = dateStr.split('-');
    const [hour, minute] = timeStr.split(':');
    return `${year}${month}${day}T${hour}${minute}00`;
  },

  /**
   * Génère le contenu du fichier .ics
   * OPTIMISÉ : METHOD:REQUEST et VALARM pour intégration agenda principal
   */
  generateICSContent: (reservations) => {
    // ✅ METHOD:REQUEST est crucial pour l'import direct dans l'agenda principal
    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Mairie de Maurepas//Reservation Salles//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST', 
      'BEGIN:VTIMEZONE',
      'TZID:Europe/Paris',
      'BEGIN:DAYLIGHT',
      'TZOFFSETFROM:+0100',
      'TZOFFSETTO:+0200',
      'TZNAME:CEST',
      'DTSTART:19700329T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
      'END:DAYLIGHT',
      'BEGIN:STANDARD',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0100',
      'TZNAME:CET',
      'DTSTART:19701025T030000',
      'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
      'END:STANDARD',
      'END:VTIMEZONE'
    ];

    reservations.forEach((res, index) => {
      const salleNom = res.salle.split(' - ')[0];
      const startDateTime = icalService.formatDateToIcalString(res.dateDebut, res.heureDebut);
      const endDateTime = icalService.formatDateToIcalString(res.dateFin || res.dateDebut, res.heureFin);
      
      const uid = `res-${res.id || index}-${Date.now()}@maurepas.fr`;
      const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      
      let description = `Réservation de salle : ${res.salle}\\n`;
      description += `Service : ${res.service}\\n`;
      description += `Objet : ${res.objet}\\n`;
      if (res.description) description += `Note : ${res.description}\\n`;
      description += `\\nAgent : ${res.prenom || ''} ${res.nom || ''}`;

      icsContent.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;TZID=Europe/Paris:${startDateTime}`,
        `DTEND;TZID=Europe/Paris:${endDateTime}`,
        `SUMMARY:📅 Réservation ${salleNom}`,
        `DESCRIPTION:${description}`,
        `LOCATION:Mairie de Maurepas - ${res.salle}`,
        'STATUS:CONFIRMED',
        'CLASS:PUBLIC',
        'TRANSP:OPAQUE',
        'SEQUENCE:0',
        `ORGANIZER;CN="Mairie de Maurepas":MAILTO:reservation@maurepas.fr`,
        // ✅ AJOUT DU RAPPEL 15 MINUTES AVANT
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        'DESCRIPTION:Rappel : votre réservation de salle à la Mairie',
        'END:VALARM',
        'END:VEVENT'
      );
    });

    icsContent.push('END:VCALENDAR');
    return icsContent.join('\r\n'); // ✅ Standard RFC 5545 (CRLF)
  },

  generateAndDownload: (reservations) => {
    try {
      const content = icalService.generateICSContent(reservations);
      const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      
      const dateStr = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
      const firstName = reservations[0]?.prenom || '';
      const lastName = reservations[0]?.nom || '';
      
      link.download = firstName && lastName 
        ? `reservation_${firstName}_${lastName}_${dateStr}.ics`
        : `reservations_maurepas_${dateStr}.ics`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error("Erreur génération ICS :", error);
    }
  }
};

export default icalService;