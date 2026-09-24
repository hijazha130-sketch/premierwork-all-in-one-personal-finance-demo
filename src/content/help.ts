/**
 * Help registry (Architecture §7.5). One place for every "?" explainer, in our
 * own plain words. Each entry: `what` explains the number, `todo` says what you
 * can do about it. All strings must pass the buyer-language lint.
 */
export interface HelpEntry {
  what: string;
  todo: string;
}

export const HELP: Record<string, HelpEntry> = {
  safeToSpend: {
    what: "What's left after we set aside the bills still coming before your next payday, plus any safety cushion — shared out evenly across the days until then.",
    todo: "Tap “How is this worked out?” to see every line. Log spends as you go and this keeps itself honest.",
  },
  thisMonth: {
    what: "Everything you've spent this month, sorted into five plain groups. The ring and the list always show the same numbers.",
    todo: "Tap a group name to move it between Everyday needs and Fun & wants — the chart follows straight away.",
  },
  dayByDay: {
    what: "One bar for each day's everyday spending. Bills are left out on purpose, so the shape shows your day-to-day habits.",
    todo: "A dot above a day means a bill is due then. Quiet days are just as useful to see as busy ones.",
  },
  untilPayday: {
    what: "How long until money next comes in, how much a day that leaves you, and what you've already spent this pay period.",
    todo: "If a day feels tight, spending a little less today lifts every day that follows.",
  },
  milestones: {
    what: "Small wins, kept once you reach them. They're worked out from your whole history, so they never slip back.",
    todo: "“Not counted yet” just means that feature isn't in use — add a goal or a debt and it starts counting.",
  },
  stillToPay: {
    what: "Bills that are due this month and not yet marked paid. The bar shows how much you've cleared against how much is left.",
    todo: "Mark a bill paid as soon as it leaves your account, so this and Safe to spend stay accurate.",
  },
  putAway: {
    what: "The total you've set aside toward your goals so far, across every goal.",
    todo: "Set money aside on any goal and it lands here. Each goal's ring shows how close it is.",
  },
  stillOwed: {
    what: "What you still owe across your debts right now — the balance you entered, minus every payment logged since.",
    todo: "Record a payment on a debt and this drops by that amount. The debt-free date updates too.",
  },
  netWorth: {
    what: "What you own minus what you owe, on today's numbers. Accounts and assets count as owned; debts and card balances as owed.",
    todo: "Add an asset's latest value now and then — the trend fills in as the months pass.",
  },
  monthAtAGlance: {
    what: "The same five groups over a longer stretch, with money in, money out, and what you kept.",
    todo: "Switch the period to compare a single month against the last three, six, or the year so far.",
  },
};
