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
- The Tratativas report uses the existing forecasts and transfers with a printable approval form; printing isolates that report from the dashboard. Board approval also happens online: a token-gated public page (/demonstrativo/$token) reads a frozen snapshot from public.demonstrativos via /api/public/demonstrativo/$token (admin client, token is the only credential, one decision per report).
- Device-email sharing is browser-only: copy formatted report HTML or download a self-contained HTML file and open a mailto draft; never send report data through managed app email services for this flow.
- The dashboard executive report reuses the dashboard's selected accounts and calculated indicators, keeping report rendering separate from financial calculations.
