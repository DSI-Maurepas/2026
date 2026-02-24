// src/data/iaData.js

export const IA_TOOLS = [
  {
    id: 'ia_1',
    nom: 'ChatGPT Plus',
    description: 'Le modèle de langage le plus polyvalent d\'OpenAI (GPT-4). Idéal pour la rédaction, l\'analyse de code, la traduction et la génération d\'idées complexes.',
    image: '/images/ia/chatgpt_plus.jpg',
    imageColor: '#10a37f', // Vert OpenAI conservé
    useCases: [
      "Rédaction et correction de courriers, notes ou rapports.",
      "Analyse de données (via Excel/CSV) et création de graphiques.",
      "Aide au codage et débogage de scripts (Python, JS, etc.).",
      "Génération d'images (DALL-E) pour supports de com.",
    ]
  },
  {
    id: 'ia_2',
    nom: 'Mistral Pro Licence 1',
    description: 'Modèle européen performant et sécurisé (Mistral Large). Parfait pour le traitement de texte en français et la synthèse rapide.',
    image: '/images/ia/mistral_pro_l1.jpg',
    imageColor: '#fcb900', // Jaune/Orange Mistral
    useCases: [
      "Traitement souverain de données textuelles.",
      "Rédaction de mails et synthèses administratives.",
      "Résumé rapide de documents courts.",
      "Traduction fluide et nuancée vers le français."
    ]
  },
  {
    id: 'ia_3',
    nom: 'Mistral Pro Licence 2',
    description: 'Version étendue de Mistral pour des contextes complexes. Capable de traiter des dossiers volumineux avec une grande finesse de raisonnement.',
    image: '/images/ia/mistral_pro_l2.jpg',
    imageColor: '#fcb900', // Jaune/Orange Mistral
    useCases: [
      "Analyse de dossiers complexes et volumineux.",
      "Raisonnement logique et aide à la décision.",
      "Structuration d'arguments pour notes de synthèse.",
      "Travail sur des textes juridiques ou réglementaires."
    ]
  },
  {
    id: 'ia_4',
    nom: 'Gamma Pro',
    description: 'IA spécialisée dans la création de présentations et de documents visuels. Génère des slides PowerPoint et des mises en page web en quelques secondes.',
    image: '/images/ia/gamma_pro.jpg',
    imageColor: '#8e44ad', // Violet Gamma
    useCases: [
      "Création rapide de supports de présentation (PPT).",
      "Transformation de notes texte en slides visuelles.",
      "Mise en page automatique de documents PDF.",
      "Création de mini-sites web pour communication interne."
    ]
  },
  {
    id: 'ia_5',
    nom: 'Claude Pro',
    description: 'L\'IA d\'Anthropic (Claude 3 Opus), reconnue pour sa capacité d\'analyse, sa nuance littéraire et sa très grande fenêtre de contexte.',
    image: '/images/ia/claude_pro.jpg',
    imageColor: '#d35400', // Orange Claude
    useCases: [
      "Analyse de documents très longs (plusieurs PDF).",
      "Rédaction nuancée et adaptation de ton (style institutionnel).",
      "Synthèse de multiples sources d'information.",
      "Aide à la programmation avancée."
    ]
  },
  {
    id: 'ia_6',
    nom: 'Gimini Pro',
    description: 'La solution multimodale de Google (Gemini 1.5). Excellente pour croiser des informations textuelles, des recherches web en temps réel et l\'analyse d\'images.',
    image: '/images/ia/gimini_pro.jpg',
    imageColor: '#2980b9', // Bleu Google
    useCases: [
      "Recherche d'informations temps réel sur le web.",
      "Analyse d'images (photos de terrain, graphiques).",
      "Intégration forte avec l'écosystème Google (Docs, Sheets).",
      "Traitement de vidéos et fichiers audio."
    ]
  },
  {
    id: 'ia_7',
    nom: 'Plaud Pro Licence 1',
    description: 'Dispositif d\'enregistrement et de transcription IA. Idéal pour les comptes-rendus de réunion, enregistrant et résumant automatiquement les échanges.',
    image: '/images/ia/plaud_pro_l1.jpg',
    imageColor: '#8e44ad', // ✅ MODIFIÉ : Violet pour différencier de ChatGPT
    useCases: [
      "Enregistrement et transcription de réunions de service.",
      "Génération automatique de comptes-rendus structurés.",
      "Prise de notes vocales et mémos rapides.",
      "Synthèse d'entretiens RH ou techniques."
    ]
  },
  {
    id: 'ia_8',
    nom: 'Plaud Pro Licence 2',
    description: 'Second dispositif de transcription IA disponible pour les équipes. Permet de transformer l\'audio en texte structuré et exploitable immédiatement.',
    image: '/images/ia/plaud_pro_l2.jpg',
    imageColor: '#8e44ad', // ✅ MODIFIÉ : Violet pour différencier de ChatGPT
    useCases: [
      "Enregistrement et transcription de réunions de service.",
      "Génération automatique de comptes-rendus structurés.",
      "Prise de notes vocales et mémos rapides.",
      "Synthèse d'entretiens RH ou techniques."
    ]
  }
];