<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep date-specific treasury calculations in `src/lib/tratativas.ts` and test them independently; historical reports must never use statement balances dated after the selected day.
- Treasury date controls must trigger an explicit reload even when selecting the same date; the expense scope is shared by the query, calculations and report snapshot to prevent inconsistent totals.
- Use `ultimoSaldoExtrato` from the treasury calculation module for current statement balances across dashboard, forecasts and reports; it rolls forward posted transactions from the latest dated balance without treating calculated balances as bank-confirmed balances.
- The Tratativas report uses the existing forecasts and transfers with a printable approval form; printing isolates that report from the dashboard. Board approval also happens online: a token-gated public page (/demonstrativo/$token) reads a frozen snapshot from public.demonstrativos via /api/public/demonstrativo/$token (admin client, token is the only credential, one decision per report).
- Device-email sharing is browser-only: copy formatted report HTML or download a self-contained HTML file and open a mailto draft; never send report data through managed app email services for this flow.
- The dashboard executive report reuses the dashboard's selected accounts and calculated indicators, keeping report rendering separate from financial calculations.
- Forecast spreadsheet import is shared by the top-level picker and file-drop flow so both save identical forecast data; the forecast tab only displays and manages those data.
- Daily balance drilldowns show posted transactions for the selected account, date and credit/debit scope through the shared transaction table; opening and closing balances stay separate from transaction totals to avoid implying they are daily sums.
