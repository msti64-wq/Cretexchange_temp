# CreteXchange NSF Phase I Research Plan

**Status:** Preliminary Six-Month Research Plan
**Boundary:** Proposed R&D only; it does not authorize implementation or claim existing model performance.

## Primary Research Objective

> Determine whether heterogeneous construction-material transaction data can be transformed into reliable, confidence-scored digital records that support material recovery decisions, marketplace transactions, and defensible environmental reporting.

## Research Questions

1. Can incomplete transaction evidence be combined into a defensible confidence score?
2. Can confidence-scored records improve marketplace recommendations and reduce incompatible or fraudulent activity?
3. Can geospatial reasoning, facility capabilities, and material characteristics identify better recovery destinations than proximity alone?
4. Can confidence-scored records support environmental metrics while transparently communicating uncertainty?

## Preliminary Hypotheses

- **H1:** A provenance-aware combination of independent evidence signals can produce better-calibrated confidence estimates than a single verification flag or unweighted rule count.
- **H2:** Confidence-aware and constraint-aware matching can reduce incompatible recommendations relative to proximity-only and material-name-only baselines.
- **H3:** Duplicate and anomaly signals can improve review prioritization at a tolerable false-positive rate when human confirmation remains part of the process.
- **H4:** Propagating record confidence and input uncertainty can produce more transparent environmental estimates than point estimates without qualification.

Hypotheses must be revised with investigators, literature review, available data, and statistical design before submission.

## Work Packages

### WP-1: Evidence Confidence Scoring

- define evidence types, provenance, dependencies, missingness, and confidence semantics
- establish rule-based and simple statistical baselines
- prototype candidate scoring and calibration methods
- test reliability, calibration, sensitivity, and explainability

### WP-2: Construction Material Taxonomy

- define a research taxonomy compatible with configurable material architecture
- represent aliases, hierarchy, uncertainty, contamination, form, and review status
- test classification consistency and error patterns against expert-reviewed labels

### WP-3: Constraint-Aware Matching

- define material, facility, capacity, geography, timing, compliance, and evidence constraints
- compare proximity-only, rule-based, and confidence-aware matching approaches
- measure compatibility, feasibility, ranking quality, and explanation usefulness

### WP-4: Fraud and Duplicate Detection

- define duplicate, anomaly, and suspected-fraud cases without conflating them
- evaluate exact rules, similarity methods, and anomaly signals
- measure precision, recall, false-positive cost, review burden, and time-to-resolution

### WP-5: Environmental Impact Modeling

- define system boundaries, sources, factors, scenarios, and uncertainty
- propagate record and factor uncertainty into outputs
- distinguish observed operational facts from estimated or modeled outcomes
- obtain independent environmental-method review

### WP-6: Pilot Validation

- run a bounded, consented field pilot with selected participants and workflows
- compare research methods against agreed baselines
- collect usability, operational, quality, and failure evidence
- document limitations, adverse findings, and readiness for follow-on work

## Preliminary Six-Month Timeline

| Month | Primary Activities | Exit Evidence |
| --- | --- | --- |
| 1 | Governance, literature review, partner confirmation, data inventory, taxonomy and evidence definitions | Approved protocol, data map, baseline definitions, risk register |
| 2 | WP-1 and WP-2 baseline implementation and expert-labeling plan | Evidence representation, taxonomy draft, labeled-sample protocol |
| 3 | WP-1 calibration experiments and WP-3 constraint/matching baselines | Interim confidence and matching evaluation |
| 4 | WP-4 anomaly/duplicate evaluation and WP-5 boundary/uncertainty model | Error analysis, environmental methodology draft |
| 5 | Integrated prototype research workflow and controlled pilot execution | Pilot dataset, monitoring record, participant feedback |
| 6 | Validation, statistical analysis, limitations, commercialization review, and final reporting | Research report, reproducibility package, Phase II/no-go recommendation |

## Proposed Validation Methods

- expert-reviewed reference samples with documented disagreement handling
- train, calibration, validation, and pilot separation where model learning is used
- comparison with simple and operationally relevant baselines
- calibration curves and proper scoring measures for confidence outputs
- classification error matrices and subgroup/coverage analysis
- matching relevance, compatibility, feasibility, and ranking evaluation
- precision, recall, false-positive cost, and investigator burden for anomaly signals
- sensitivity and uncertainty analysis for environmental outputs
- field-pilot observation, structured participant feedback, and adverse-event logging
- reproducibility review and documented data limitations

## Preliminary Success Criteria

Final thresholds require statistical and domain-expert review. Phase I should at minimum demonstrate:

- confidence scores that are meaningfully calibrated and more informative than the agreed baseline
- a taxonomy with reproducible expert labeling and explicit uncertainty paths
- constraint-aware recommendations that reduce incompatible destinations without unacceptable loss of useful options
- duplicate or anomaly review that improves prioritization without excessive false positives
- environmental outputs that expose uncertainty and never present modeled outcomes as verified facts
- a pilot that can be operated with acceptable participant burden, privacy controls, and data quality
- sufficient evidence for a reasoned Phase II, commercialization, revision, or stop decision

## Deliverables

1. research protocol and data-governance plan
2. evidence/provenance schema and confidence semantics
3. research material taxonomy and labeling guide
4. baseline and candidate method evaluation
5. constraint-aware matching specification and results
6. duplicate/anomaly evaluation and review workflow
7. environmental boundary, factor, and uncertainty framework
8. pilot report, limitations, and lessons learned
9. commercialization evidence update
10. final technical report and follow-on recommendation

## Dependencies

- qualified principal investigator and domain advisers
- appropriate participant agreements, consent, and data rights
- sufficiently varied and representative research data
- expert labeling and adjudication capacity
- facility capability and geospatial reference data
- environmental factors with documented provenance and permitted use
- secure research environment and reproducible analysis workflow
- partner availability for controlled pilot validation

## Risks and Stop Conditions

- insufficient or unrepresentative evidence
- inability to establish lawful and ethical data use
- confidence scores that cannot be calibrated or explained
- material labels too inconsistent for meaningful validation
- matching gains that disappear outside a narrow sample
- unacceptable fraud/anomaly false positives
- environmental uncertainty too large or poorly sourced for defensible reporting
- pilot burden, safety, privacy, or partner risk exceeding expected value

Negative or inconclusive results are valid research outcomes and must be reported accurately.
