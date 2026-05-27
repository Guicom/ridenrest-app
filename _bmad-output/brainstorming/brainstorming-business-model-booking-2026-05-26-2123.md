---
stepsCompleted: [1]
inputDocuments: []
session_topic: 'Business model & architecture de monétisation cross-platform (web + app native) pour ridenrest-app'
session_goals: 'Identifier un (ou des) modèle(s) économique(s) viable(s) pour un side project rentable, en résolvant le casse-tête paiement web ↔ stores natifs, avec API Booking comme levier possible parmi d''autres'
selected_approach: ''
techniques_used: []
ideas_generated: []
context_file: '_bmad-output/project-context.md'
---

# Brainstorming Session Results

**Facilitator:** Guillaume
**Date:** 2026-05-26

## Session Overview

**Topic:** Business model & architecture de monétisation cross-platform pour ridenrest-app

**Goals:**
- Cartographier les modèles économiques viables pour une plateforme bikepacking (solo dev, side project rentable)
- Résoudre la dualité web ↔ stores natifs (Apple/Google) pour les paiements et l'accès utilisateur
- Identifier les leviers de monétisation (dont API Booking en commission affiliée) et les features à placer derrière le paywall
- Explorer les stratégies de réduction des commissions stores (paywall externe, modèles "reader", Stripe-only…)

### Context Guidance

**Projet :** ridenrest-app — plateforme bikepacking/cyclotourisme
- Web Next.js + NestJS déployé sur VPS Hostinger (architecture autohébergée)
- App native en cours de développement
- Stack : Better Auth (auth), Drizzle/PostgreSQL+PostGIS, MapLibre, TanStack Query
- Features : planification d'aventures GPX, POIs (hébergements, ravito, eau), mode live GPS RGPD-compliant
- API Booking : intégration planifiée — déclencheur potentiel d'une fonctionnalité payante

**Ambition :** side project rentable (couvrir VPS ~8$/mois + temps du dev), pas d'objectif startup/scale.

**Contraintes / préférences confirmées :**
- Pas de préférence forte sur la plateforme de paiement, mais critères : commission faible + communauté active
- App native rend les stores quasi inévitables → arbitrage à faire
- Booking API = levier possible, pas pivot obligatoire

### Session Setup

Session de brainstorming guidée par Mary (BMad analyst). Approche à sélectionner à l'étape suivante.
