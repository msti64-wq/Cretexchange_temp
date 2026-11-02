# Baseline comparison — Phase 1 (synthetic only)

This is an engineering sanity check, not a scientific validation. Run:
`node --import tsx --test tests/recovery-state-research.test.ts tests/recovery-state-comparison.test.ts`

## Methods
- Illustrative naive operational proxy: deliberately equates approval + good location/photo with recovery. **Not** CreteXchange's actual production behavior.
- Deterministic evidence-gated method: requires independent receipt, processing record, recovered output, and batch reconciliation before declaring recovery. **Not** a novel algorithm.
- Conventional probabilistic baseline: **deferred** until there are independent observed labels and a defensible probabilistic model; fabricated likelihoods would create false confidence.

## Measures
- False recovery confirmations: predicted recovered where reference says not recovered.
- Recovery decision coverage: fraction of all cases positively declared recovered. This is **not** the usual selective-classification coverage (fraction receiving any non-abstaining prediction); the distinction is intentional.
- Precision/recall of positive recovery declarations, with null precision for zero positive predictions.
- Highest-state agreement and review count.

The synthetic labels are manually assigned and consistent with the evidence-gated rules by construction; perfect agreement cannot establish real-world accuracy. The 10 scenarios are not sampled from real facility operations, so no confidence intervals, production error rates, or NSF novelty conclusions are justified. The 10 cases also treat lack of independent evidence as not recovered for comparison purposes, whereas in reality missing proof can mean **unknown**, not **physically not recovered**. Future empirical evaluation must separate negative outcomes from unobserved outcomes.

## Decision gate
Before a probabilistic model or grant claim: obtain authorized independent facility intake, processing, and output records; establish provenance and missingness; adjudicate positive, negative, and unknown labels; split by facility and time; measure error rates and coverage together.
