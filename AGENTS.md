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
- The Tratativas report uses the existing forecasts and transfers with a printable approval form, not a digital authorization workflow; printing isolates that report from the dashboard.
