# Formulaire de feedback — Beta testeurs Dersertus Bikus

> **Contexte** : Beta test de Ride'n'Rest sur la Dersertus Bikus (event terminé le ~2026-04-26).
> **Public** : ~10 beta testeurs, contactés par email.
> **Format** : Google Form, ~5 min de remplissage.
> **Objectif** : identifier les bugs et points de friction pour orienter la roadmap MVP (deadline avril 2026).

---

## Architecture du form

| # | Question | Type Google Forms | Obligatoire |
|---|----------|-------------------|:-----------:|
| Q1 | Fréquence d'usage pendant l'event | Choix multiples | ✅ |
| Q2 | Moment "merci l'app" (story) | Paragraphe | ❌ |
| Q3 | Moment où l'app a déçu (story) | Paragraphe | ❌ |
| Q4 | Bugs rencontrés (liste) | Paragraphe | ❌ |
| Q5 | UNE chose à corriger / améliorer | Réponse courte | ❌ |
| Q6 | Feature manquante | Paragraphe | ❌ |
| Q7 | NPS recommandation + verbatim | Échelle 0-10 + Paragraphe | ✅ note / ❌ verbatim |

---

## Questions détaillées

### Q1 — Adoption réelle

**Question :**
> Pendant la Dersertus Bikus, à quelle fréquence as-tu ouvert Ride'n'Rest ?

**Type Google Forms** : `Choix multiples` (radio = 1 seul choix)
**Obligatoire** : ✅ Oui

**Options :**
- Jamais ou presque (0 à 1 fois sur tout l'event)
- Quelques fois en tout (2-5 fois)
- 1 à 2 fois par jour
- Plusieurs fois par jour

---

### Q2 — Moment le plus utile (story)

**Question :**
> Y a-t-il eu un moment où tu t'es dit "merci l'app" pendant l'event ?

**Type Google Forms** : `Paragraphe`
**Obligatoire** : ❌ Non

**Texte d'aide :**
> Si oui, raconte (le plus concret possible : où, quand, quoi). Si non, écris simplement "non" et passe à la suivante.

---

### Q3 — Moment où l'app a déçu (story)

**Question :**
> Y a-t-il eu un moment où l'app t'a déçu ou ne t'a pas aidé comme tu l'espérais ?

**Type Google Forms** : `Paragraphe`
**Obligatoire** : ❌ Non

**Texte d'aide :**
> Décris concrètement ce qui s'est passé : ce que tu voulais faire, ce qui n'a pas marché ou ce qui t'a manqué. Pas besoin que ce soit grave. Si tout s'est bien passé, écris "non".

---

### Q4 — Bugs rencontrés (liste)

**Question :**
> Quels bugs ou comportements bizarres as-tu rencontrés pendant l'event ?

**Type Google Forms** : `Paragraphe`
**Obligatoire** : ❌ Non

**Texte d'aide :**
> Liste rapide, une ligne par souvenir suffit. Exemples : l'app a planté, lenteur anormale, données qui s'affichent mal, fonction qui ne marche pas, message d'erreur, déconnexion inattendue, etc. Si tu n'as rien remarqué, écris "aucun".

---

### Q5 — La priorité unique

**Question :**
> Si tu pouvais améliorer ou corriger UNE seule chose dans l'app, ce serait quoi ?

**Type Google Forms** : `Réponse courte`
**Obligatoire** : ❌ Non

**Texte d'aide :**
> Pas une liste — juste celle qui te ferait le plus de bien. Sois concret (ex : "que la recherche d'hébergement soit plus rapide" plutôt que "que ce soit mieux").

---

### Q6 — Feature manquante

**Question :**
> Quelle fonctionnalité aurait pu t'être utile pendant l'event mais qui n'est pas (encore) dans l'app ?

**Type Google Forms** : `Paragraphe`
**Obligatoire** : ❌ Non

**Texte d'aide :**
> Une feature manquante, peu importe que d'autres apps la fassent ou non. Si rien ne te vient, écris "rien".

---

### Q7 — NPS + verbatim

**Question 1 — la note :**
> À quel point recommanderais-tu Ride'n'Rest à un ami qui prépare une aventure bikepacking ?

**Type Google Forms** : `Échelle linéaire` (0 à 10)
**Légendes** : 0 = "Pas du tout" / 10 = "Sans hésiter"
**Obligatoire** : ✅ Oui

**Question 2 — le verbatim :**
> Pourquoi cette note ?

**Type Google Forms** : `Paragraphe`
**Obligatoire** : ❌ Non

---

## Notes de design

- **Ton général** : familier mais propre (tutoiement, vocabulaire courant, pas d'argot type "galérer").
- **Stratégie obligation** : seules Q1 (adoption) et Q7 note (NPS) sont obligatoires. Tout le reste est ouvert pour ne pas faire fuir.
- **Stratégie ouverture** : chaque question ouverte autorise explicitement une réponse "non" / "rien" / "aucun" pour donner une porte de sortie sans abandon du form.
- **Couverture funnel** : adoption (Q1) → wow (Q2) → friction émotionnelle (Q3) → bugs techniques (Q4) → priorité roadmap (Q5) → features absentes (Q6) → métrique benchmark + verbatim (Q7).
- **Temps estimé de remplissage** : ~5 min (4 questions ouvertes + 1 fermée + 1 NPS).

---

## Mail d'invitation (texte brut)

> **À habiller dans Claude design** (HTML graphique) une fois le texte validé.
> **Personnalisation manuelle** : remplacer `[Prénom]` testeur par testeur (N=10).
> **Lien à insérer** : remplacer `[LIEN_DU_FORM]` par l'URL Google Forms.

### Sujet

> **5 min pour me raconter ta Dersertus avec Ride'n'Rest**

### Corps

```
Salut [Prénom],

J'espère que tes jambes ont récupéré de la Dersertus !

Une semaine après, je me permets de te solliciter pour ton retour sur Ride'n'Rest. T'es l'un des tout premiers à avoir mis l'app à l'épreuve sur un vrai event, et franchement, ce que tu vas me dire vaut de l'or pour la suite.

J'ai préparé un form ultra court : 7 questions, ~5 min top chrono.

👉 [LIEN_DU_FORM]

Pas de pression : seules 2 questions rapides sont obligatoires, le reste tu réponds si t'as envie. Et si tu préfères qu'on en discute (15 min en visio), réponds simplement à ce mail.

Merci d'avance — c'est grâce à des retours comme le tien que l'app va vraiment se construire.

Guillaume

---
PS : Si tu peux répondre dans la semaine, c'est parfait — après, les souvenirs précis commencent à s'estomper.
```

### Notes de design (mail)

- **Ton** : familier propre (tutoiement, "merci l'app" / "ça vaut de l'or"), cohérent avec le form.
- **Longueur** : ~140 mots + PS. Lecture en ~30 sec.
- **CTA unique** : un seul lien (le form). Le call de 15 min est une porte de sortie alternative, pas un second CTA.
- **Bouton vs lien texte** : si version HTML, transformer `👉 [LIEN_DU_FORM]` en bouton CTA visible (idéalement contrasté avec le reste de la maquette).
- **Personnalisation** : `[Prénom]` à remplacer manuellement (10 envois individuels, pas de mass-mail anonyme).

---

## À traiter ensuite

- [ ] Texte d'intro du Google Form (titre + 2-4 lignes d'accueil)
- [ ] Habiller le mail en version HTML graphique (Claude design)
- [ ] Stratégie de relance (J+5 ? J+7 ?)
- [ ] Décider de la création éventuelle d'une mécanique d'engagement (carotte, retour personnalisé, etc.)
