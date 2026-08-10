# StripePros Scanner Regression Rule

Every change to lot capture, AI scanning, detection merging, map zoom, or scan timeouts must be tested end-to-end before the work is considered complete.

## Required live regression

1. Build and deploy the candidate version.
2. Open the live `/workspace` route in an authenticated browser session.
3. Search for `3231 University Ave, San Diego, CA 92104`.
4. Draw the known parking-lot boundary around the customer pavement and run the scan.
5. Wait for the final result. A timeout, failed scan, or successful-looking zero count is a release blocker.
6. Confirm that visible stalls produce nonzero stall annotations and that the result contains no obvious duplicate marker pairs on the same physical stall.
7. Review the visible drive aisles and right-side accessible path for missed arrows and paths of travel.
8. Record the observed result in the task handoff. Do not claim the scanner is fixed based only on unit tests or a production build.

## Automated checks

Run the full test suite and production build. Keep unit coverage for timeout fallback, cross-section merging, same-row duplicate reconciliation, and failed-zero behavior.
