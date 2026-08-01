# CTX-STD-003 — CreteXchange Product Terminology Standard

- **Document ID:** CTX-STD-003
- **Requested identifier:** CTX-STD-002 (unavailable; already assigned to the approved Documentation Governance standard)
- **Version:** 1.0
- **Status:** Approved
- **Owner:** CreteXchange Product and Engineering
- **Scope:** Customer-facing product language, localization, exports, support messages, and current product documentation
- **Approval Authority:** Michael Loren Stiger, CreteXchange Project Owner
- **Approval Date:** August 1, 2026
- **Effective Date:** August 1, 2026
- **Review Frequency:** Semiannual and when a material catalog or customer workflow changes
- **Related standards:** [CTX-STD-001](./cretexchange-platform-standards.md), [CTX-STD-002](./CTX-STD-002-documentation-governance-metadata-lifecycle-authority-and-relationships.md)

## 1. Purpose and platform-positioning language

CreteXchange is a **Construction Circular Economy Intelligence Platform** and, in operational contexts, a **Construction Materials Recovery Platform**. Product messaging may describe the multi-material ecosystem as the **Construction Recovery Network**. Customer-facing language must not position the platform as limited to concrete washout.

## 2. Canonical Facility terms

Use **Recovery Facility** for a business or operational site. Use **Recovery Location** only for a geographic destination or selectable map location. Use **Accepted Materials** to describe the specific catalog or approved custom materials a Facility accepts. Never imply that every Facility accepts every material.

| Do not use for a platform concept | Use |
| --- | --- |
| Washout Yard | Recovery Facility |
| Washout Facility | Recovery Facility |
| Washout Location | Recovery Facility; Recovery Location only for map geography |

## 3. Canonical activity terms

Use **Material Recovery Activity**, **Material Recovery Submission**, **Recovery Verification**, **Recovery Evidence**, and **Verified Activity**. Driver calls to action should remain brief: **Find a Recovery Facility**, **Select Material**, **Check In**, **Upload Recovery Evidence**, **Submit Recovery Activity**, and **View Recovery History**.

## 4. Canonical reporting terms

Use **Material Recovery Activity Report**, **Material Recovery Activity Volume**, and **Recovery History** for cross-material totals. Keep a material name in any material-specific report value or filter, such as **Concrete Washout volume**.

## 5. Canonical intelligence terms

Use **Recovery Analytics**, **Recovery Intelligence**, **Facility Intelligence**, **Driver Intelligence**, and **Network Intelligence**. Use **Verified Material Recovery Activities**, **Verified Activities**, **Recovery Milestones**, or **Verified Activity Count** for achievements and competition.

## 6. Material-type exception

Material catalog names are business data, not product branding. Hauled materials, accepted materials, selected active materials, material filters, catalog entries, material-specific report values, and approved custom materials must retain their technically accurate names. This includes Returned Concrete, Reclaimed Concrete, Asphalt, Brick, Block, Soil, Aggregate, Wood, Drywall, Roofing Materials, and future catalog entries.

## 7. Concrete Washout preservation rule

**Concrete Washout** must remain exactly **Concrete Washout** when it names a hauled or accepted material, a catalog entry, a Driver selection, a Facility eligibility value, a stored slug or label, a regulatory classification, a report filter, or a material-specific report result. It must not be changed to “Concrete Recovery” or a generic activity label.

## 8. Internal-identifier preservation rule

Database tables, columns, migrations, API routes, analytics events, TypeScript identifiers, storage keys, audit references, test selectors, and stable payload properties may retain legacy `washout` names. Customer-facing presentation must map those identifiers to canonical terminology. Terminology work must not trigger a broad technical refactor.

## 9. Legal, regulatory, and quoted terminology rule

Preserve language whose original wording is legally significant, regulatory, industry-defined, contractually approved, historical, or directly quoted. A future legal revision requires the appropriate review and versioning process; this standard does not silently rewrite executed or accepted legal text.

## 10. Driver-language simplicity rule

Driver workflow language must be immediate, familiar, and action-oriented. Keep **Check In** and avoid long strategic terminology in task controls. A terminology change must not change readiness, GPS, material eligibility, photo privacy, submission, verification, or Owner approval behavior.

## 11. English and Spanish terminology mapping

| English | Spanish |
| --- | --- |
| Recovery Facility | Instalación de recuperación |
| Recovery Location | Ubicación de recuperación |
| Material Recovery Activity | Actividad de recuperación de materiales |
| Material Recovery Submission | Envío de recuperación de materiales |
| Recovery Verification | Verificación de recuperación |
| Recovery Evidence | Evidencia de recuperación |
| Recovery History | Historial de recuperación |
| Material Recovery Activity Report | Informe de actividades de recuperación de materiales |
| Recovery Analytics | Analítica de recuperación |
| Construction Recovery Network | Red de recuperación para la construcción |
| Construction Circular Economy Intelligence Platform | Plataforma de inteligencia para la economía circular de la construcción |

Stored material values are not renamed through localization. The approved material-catalog translation policy controls display translations without mutating canonical data.

## 12. Correct and incorrect usage

| Context | Correct | Incorrect |
| --- | --- | --- |
| Driver destination | Find a Recovery Facility | Find a Washout Yard |
| Driver action | Submit Recovery Activity | Submit Washout |
| Cross-material history | Recovery History | Washout History |
| Material selection | Material: Concrete Washout | Material: Concrete Recovery |
| Facility eligibility | Accepts Concrete Washout | Accepts generic Recovery |
| Cross-material metric | Verified Activities | Verified Washouts |
| Material-specific metric | Concrete Washout volume | Recovery volume, when material identity matters |
| API route | `/api/washout-photos` | Rename solely for branding |
| Schema | `washout_activities` | Rename solely for branding |

## 13. Development and review controls

Future customer-facing development must reference this standard. Reviewers must classify every proposed legacy occurrence as material data, customer-facing platform language, internal identifier, legal/regulatory language, or historical documentation. Automated tests must preserve canonical material names, validate English and Spanish terminology, verify export labels, and prove that stable internal interfaces remain compatible.
