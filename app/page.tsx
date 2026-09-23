import { CreateRoom, TryDemo } from "@/components/CreateRoom";
import { ConsentStrip, Footer, Wordmark } from "@/components/ui";
import { POLICY_TEXT } from "@/lib/actions";

const EXAMPLE = [
  { name: "Riya", state: "Agreed" },
  { name: "Siddharth", state: "Agreed" },
  { name: "Karan", state: "No answer yet" },
  { name: "Aisha", state: "Agreed" },
  { name: "Preethi", state: "Agreed" },
];

export default function Home() {
  return (
    <>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Wordmark />
        <a href="#start" className="btn-link">Start a room</a>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        <section className="grid gap-10 pb-14 pt-6 md:grid-cols-[1.15fr_1fr] md:items-end md:pt-14">
          <div>
            <h1 className="max-w-[16ch] text-[2.35rem] leading-[1.08] sm:text-5xl">One trip that all five of you have said yes to.</h1>
            <p className="mt-5 max-w-[34rem] text-lg text-muted">
              Everyone saves their limits through one link. We suggest a few trips with a cost estimate for each person, and review one at a time. A trip is agreed only when every person says yes.
            </p>
            <div className="mt-7 flex flex-wrap items-start gap-3">
              <div><TryDemo /></div>
              <a href="#start" className="btn-quiet">Start a room</a>
            </div>
            <p className="hint mt-3">The demo opens as Karan, one of five friends planning a November trip.</p>
          </div>

          <figure className="panel p-5">
            <p className="font-serif text-lg font-semibold">Hampi, Fri 9 Oct – Sun 11 Oct</p>
            <p className="hint mb-4">Up for review. 4 of 5 have said yes.</p>
            <ConsentStrip people={EXAMPLE} />
            <figcaption className="mt-5 border-t border-line pt-4 text-sm">
              <strong>Not agreed yet.</strong> Karan hasn't answered, and silence isn't a yes. Nobody else can answer for Karan.
            </figcaption>
          </figure>
        </section>

        <section className="border-t border-line py-12" aria-labelledby="how">
          <h2 id="how" className="text-2xl">How it decides</h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            {[
              ["Everyone adds their limits", "Home city, max budget, which weekends work, what you won't do. About two minutes. Your budget and notes stay private."],
              ["Rules suggest a few trips", "Each person sees their own estimate, with the basis and date, and whether the trip fits their limits. One trip is up for review at a time."],
              ["Agreed only when all say yes", "Your yes is tied to the trip's current terms. If the dates change, everyone re-confirms. The deadline records what happened; it never picks a winner."],
            ].map(([t, d], i) => (
              <li key={t} className="border-l-2 border-forest pl-4">
                <p className="font-serif text-sm font-semibold text-forest">Step {i + 1}</p>
                <h3 className="mt-1 text-lg">{t}</h3>
                <p className="mt-2 text-muted">{d}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 max-w-read text-sm text-muted">
            No live fares or bookings, on purpose: a wrong price that breaks someone's budget would start the blame all over again. Every number is an estimate you can check and correct. Everyone books their own travel.
          </p>
        </section>

        <section id="start" className="scroll-mt-6 border-t border-line py-12" aria-labelledby="start-h">
          <div className="max-w-read">
            <h2 id="start-h" className="text-2xl">Start a room</h2>
            <p className="mt-2 text-muted">You get one group link to share, and a private coordinator link for yourself.</p>
            <div className="mt-6">
              <CreateRoom policy={POLICY_TEXT} />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
