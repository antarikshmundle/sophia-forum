import React from "react";
import { FallbackImage } from "@/components/ui/FallbackImage";
import { publicFromBackend, publishedHod } from "@/lib/cms/public";

interface Message {
  heading: string;
  name: string;
  designation: string;
  image: string;
  quote: string;
}

// Layout follows the original principal testimonial (captured 2026-10-29)
function MessageCard({ heading, name, designation, image, quote }: Message) {
  return (
    <section className="graph-paper py-16 md:py-24" aria-labelledby="principal-heading">
      <h2 id="principal-heading" className="sr-only">
        {heading}
      </h2>
      <figure className="max-w-7xl mx-auto px-4 md:px-8 grid md:grid-cols-2 gap-10 items-center">
        <div className="glass rounded-[20px] shadow-glass p-2 rotate-[-1deg] w-fit mx-auto">
          <div className="relative w-48 h-60 sm:w-56 sm:h-64 rounded-2xl overflow-hidden bg-muted">
            <FallbackImage
              src={image}
              alt={name}
              fallbackName={name}
              fill
              className="object-cover object-top"
              sizes="224px"
            />
          </div>
        </div>
        <div>
          <span className="text-5xl text-google-blue font-display" aria-hidden="true">
            &ldquo;
          </span>
          <blockquote className="font-body text-lg leading-relaxed text-muted-foreground -mt-4">
            <p>{quote}</p>
          </blockquote>
          <figcaption className="mt-6">
            <p className="font-heading font-bold">{name}</p>
            <p className="font-body text-sm text-muted-foreground">{designation}</p>
          </figcaption>
        </div>
      </figure>
    </section>
  );
}

export async function PrincipalCard() {
  // Demo mode has no built-in HOD card; the HOD and their message come from the CMS.
  if (!publicFromBackend()) return null;
  // CMS backend: the active HOD's published (approved) message only. With no HOD, no published message, or a
  // failed read, the card is not shown (the failure is logged on the server); built-in text is never substituted.
  const result = await publishedHod();
  if (!result.ok || !result.data) return null;
  const { name, designation, image, message } = result.data;
  return <MessageCard heading="A word from the Head of Department" name={name} designation={designation} image={image} quote={message} />;
}
