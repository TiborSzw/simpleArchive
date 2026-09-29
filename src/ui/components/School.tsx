// "Fotoschule": how to photograph miniatures and terrain with a phone.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { kvGet, kvSet } from '../../native/platform';
import { Icon, type IconName } from '../icons';
import { openSheet, push, replaceTop } from '../nav';
import { AngleDiagram, LightBoxDiagram, LightSetupDiagram, SweepDiagram } from './Diagrams';
import { Page } from './ui';

function Tip({ children, title = 'Tipp' }: { children: ComponentChildren; title?: string }) {
  return (
    <aside class="tip">
      <Icon name="bulb" size={18} />
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </aside>
  );
}

function DoDont({ good, bad }: { good: ComponentChildren[]; bad: ComponentChildren[] }) {
  return (
    <div class="dodont">
      <div class="do">
        <h4>
          <Icon name="check" size={16} /> Mach das
        </h4>
        <ul>
          {good.map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
      </div>
      <div class="dont">
        <h4>
          <Icon name="x" size={16} /> Lass das
        </h4>
        <ul>
          {bad.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Steps({ children }: { children: ComponentChildren[] }) {
  return (
    <ol class="steps">
      {children.map((c, i) => (
        <li key={i}>{c}</li>
      ))}
    </ol>
  );
}

function Figure({ children, caption }: { children: ComponentChildren; caption: string }) {
  return (
    <figure class="figure">
      {children}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

interface Lesson {
  id: string;
  icon: IconName;
  title: string;
  teaser: string;
  body: () => ComponentChildren;
}

const LESSONS: Lesson[] = [
  {
    id: 'quick',
    icon: 'sparkle',
    title: 'Die 5-Minuten-Fotoschule',
    teaser: 'Die fünf Dinge, die 90 % ausmachen',
    body: () => (
      <>
        <p class="lead">Du brauchst keine Kamera und kein Studio. Mit diesen fünf Regeln sehen deine Minis am Handy so aus wie in echt – oder besser.</p>
        <Steps>
          {[
            <>
              <strong>Weiches Licht von vorne-oben.</strong> Zwei Schreibtischlampen links und rechts vorne, oder ein helles Fenster ohne direkte Sonne. Die Deckenlampe allein macht harte Schatten und gelbe Farben.
            </>,
            <>
              <strong>Ruhiger Hintergrund.</strong> Ein Blatt Papier oder Fotokarton, hinten an einen Stapel Bücher gelehnt, sodass es im Bogen unter die Mini läuft. Grau ist am einfachsten, Weiß wirkt edel, Schwarz dramatisch.
            </>,
            <>
              <strong>Nicht ganz nah ran – lieber 2× Zoom.</strong> Aus 20–30 cm mit 2× wirkt die Mini natürlich und mehr ist scharf. Zuschneiden kannst du danach in simpleArchive.
            </>,
            <>
              <strong>Aufs Gesicht tippen, dann etwas abdunkeln.</strong> Fokus auf die Augen der Mini setzen, dann den Belichtungs-Regler (Sonne) leicht runterziehen, bis helle Stellen nicht mehr ausfressen.
            </>,
            <>
              <strong>Handy auflegen, Selbstauslöser an.</strong> Stativ, Bücherstapel oder Blu-Tack – und 2 s Selbstauslöser. Ruhige Handys machen scharfe Fotos, auch bei wenig Licht.
            </>,
          ]}
        </Steps>
        <Figure caption="So sieht der ganze Aufbau von oben aus.">
          <LightSetupDiagram />
        </Figure>
        <Tip title="Immer gleich aufbauen">Markier dir mit Klebeband, wo Mini, Lampen und Handy stehen. Dann sehen alle Fotos einer Armee gleich aus – und der Vorher/Nachher-Vergleich in simpleArchive wird richtig schön.</Tip>
      </>
    ),
  },
  {
    id: 'light',
    icon: 'sun',
    title: 'Licht',
    teaser: 'Weich, hell, eine Farbe – das Wichtigste überhaupt',
    body: () => (
      <>
        <p class="lead">Gutes Licht ist wichtiger als jedes Handy. Es soll drei Dinge sein: weich, hell genug und überall gleich warm.</p>
        <h3>Weich statt hart</h3>
        <p>
          Eine nackte LED-Lampe ist ein kleiner, harter Punkt: tiefe Schatten unter Helm und Arm, grelle Reflexe auf Metallfarben. Große, weiche Lichtquellen verteilen das Licht – dafür reicht ein <strong>Blatt Backpapier</strong> vor der Lampe (Abstand halten, LEDs werden kaum warm) oder ein Karton-Lichtzelt.
        </p>
        <p>Faustregel: Je größer die Lichtquelle im Verhältnis zur Mini und je näher dran, desto weicher das Licht.</p>
        <h3>Zwei Lampen im 45°-Winkel</h3>
        <p>
          Das <strong>Hauptlicht</strong> steht schräg vorne-oben (etwa 45° seitlich und 45° von oben). Das zweite Licht auf der anderen Seite ist schwächer oder weiter weg und hellt die Schatten nur auf. Hast du nur eine Lampe: Ein weißer Karton auf der Schattenseite wirkt als Aufheller.
        </p>
        <Figure caption="Hauptlicht und Aufheller links und rechts vorne, das Handy dazwischen.">
          <LightSetupDiagram />
        </Figure>
        <h3>Eine Lichtfarbe</h3>
        <p>
          Mischlicht ist der häufigste Grund für komische Farben: gelbe Deckenlampe + kühles Tageslicht + weiße LED. <strong>Alles andere ausschalten</strong> und Lampen mit derselben Farbtemperatur nehmen – ideal 5000–5600 Kelvin („Tageslicht“, „neutralweiß“). Achte beim Kauf auf <strong>CRI bzw. Ra ≥ 90</strong>, besser 95: Dann zeigen die Lampen Farben so, wie sie wirklich sind.
        </p>
        <h3>Das Fenster als Gratis-Softbox</h3>
        <p>Ein helles Fenster ohne direkte Sonne (bewölkter Tag, Nordfenster) ist wunderbar weiches Licht. Mini seitlich zum Fenster, weißer Karton auf der anderen Seite zum Aufhellen. Nachteil: Die Lichtfarbe ändert sich über den Tag.</p>
        <DoDont
          good={['Deckenlicht aus, nur deine Fotolampen an', 'Backpapier oder Lichtzelt als Diffusor', 'Aufheller (weißer Karton) gegenüber vom Hauptlicht', 'Lampen gleicher Sorte und Farbtemperatur']}
          bad={['Handy-Blitz – flach und mit Glanzpunkten', 'Direkte Sonne – harte Schatten, ausgefressene Farben', 'Ringlicht direkt vorne – flach, und Metallics spiegeln einen Ring', 'Licht nur von oben – dunkle Augenhöhlen unter Helmen']}
        />
      </>
    ),
  },
  {
    id: 'background',
    icon: 'layers',
    title: 'Hintergrund',
    teaser: 'Hohlkehle, Farbe und Abstand',
    body: () => (
      <>
        <p class="lead">Der Hintergrund soll die Mini zeigen, nicht mit ihr konkurrieren. Am besten: einfarbig, ohne Kanten, ohne Krimskrams.</p>
        <h3>Die Hohlkehle</h3>
        <p>
          Ein Bogen Fotokarton (A3 oder A2) liegt flach unter der Mini und läuft hinten in einem <strong>weichen Bogen</strong> nach oben – angelehnt an Bücher, Box oder Wand. So gibt es keine Tischkante und keinen Horizont im Bild.
        </p>
        <Figure caption="Seitenansicht: Papier im Bogen, Mini auf dem flachen Teil, Handy auf Augenhöhe.">
          <SweepDiagram />
        </Figure>
        <h3>Welche Farbe?</h3>
        <ul class="plain-list">
          <li>
            <strong>Grau</strong> – der Allrounder. Das Handy belichtet fast immer richtig, Farben bleiben neutral. Wenn du dich nicht entscheiden kannst: Grau.
          </li>
          <li>
            <strong>Weiß</strong> – clean und edel, wie im Katalog. Das Handy macht Weiß gern grau: Belichtung etwas hoch, danach Weißpunkt korrigieren.
          </li>
          <li>
            <strong>Schwarz</strong> – dramatisch, super für OSL, Magie und helle Minis. Dunkle Rüstungen verschwinden aber, und Staub sieht man sofort. Belichtung runter.
          </li>
          <li>
            <strong>Verlauf</strong> – entsteht fast von selbst, wenn die Mini näher am Licht steht als der Hintergrund. Oder: ein Tablet mit Verlaufsbild als Hintergrund (Helligkeit runter).
          </li>
          <li>
            <strong>Farbig</strong> – sparsam. Eine Komplementärfarbe (Blau hinter oranger Mini) kann schön sein, färbt aber die Kanten ein.
          </li>
        </ul>
        <h3>Abstand</h3>
        <p>
          Stell die Mini <strong>15–30 cm vor</strong> die hintere Wand der Hohlkehle. Dann fällt ihr Schatten nicht auf den Hintergrund und der Hintergrund wird leicht unscharf – die Mini springt nach vorne.
        </p>
        <Tip title="Stimmung statt Studio">Für Stimmungsbilder passt dein eigenes Gelände als Kulisse – etwa aus simpleArmy. Für die „Portfolio“-Aufnahme in simpleArchive aber lieber neutral: Da zählt die Bemalung.</Tip>
      </>
    ),
  },
  {
    id: 'phone',
    icon: 'camera',
    title: 'Handy richtig einstellen',
    teaser: 'Zoom, Fokus, Belichtung, Pro-Modus',
    body: () => (
      <>
        <p class="lead">Moderne Handys machen tolle Fotos – aber ihre Automatik ist für Gesichter und Landschaften gebaut, nicht für 32-mm-Helden. Ein paar Handgriffe machen den Unterschied.</p>
        <Steps>
          {[
            <>
              <strong>Linse putzen.</strong> Fingerabdrücke auf der Linse machen alles milchig. Einmal mit dem T-Shirt drüber wirkt Wunder.
            </>,
            <>
              <strong>Abstand + 2× Zoom.</strong> Ganz nah mit 1× verzerrt: Die Base wird riesig, der Kopf klein. Aus 20–30 cm mit 2× (bei vielen Handys verlustarm aus dem großen Hauptsensor geschnitten) wirkt die Mini natürlich. Nicht weiter digital zoomen – lieber danach zuschneiden.
            </>,
            <>
              <strong>Fokus aufs Gesicht tippen – und halten.</strong> Lang drücken sperrt Fokus und Belichtung (AE/AF-Sperre), dann springt nichts mehr um.
            </>,
            <>
              <strong>Belichtung korrigieren.</strong> Neben dem Fokuspunkt erscheint eine Sonne: runterziehen, bis helle Flächen Zeichnung behalten (meist −0,3 bis −1). Auf weißem Hintergrund eher etwas hoch.
            </>,
            <>
              <strong>Automatik-Extras aus.</strong> Porträtmodus (künstliche Unschärfe schneidet Waffen und Speerspitzen ab), Beauty-Filter, „KI-Szenenerkennung“ und kräftige Farbfilter glätten Pinselstriche und übersättigen.
            </>,
            <>
              <strong>Blitz aus, Raster an.</strong> Das Raster in den Kamera-Einstellungen hilft, die Mini gerade und mittig zu setzen.
            </>,
          ]}
        </Steps>
        <h3>Pro-Modus – wenn du mehr willst</h3>
        <p>Die meisten Android-Kameras haben einen Pro- oder Manuell-Modus (bei OnePlus und Oppo meist unter „Mehr“ → „Pro“). Damit legst du fest, was die Automatik sonst rät:</p>
        <ul class="plain-list">
          <li>
            <strong>ISO 50–100</strong> – so wenig Rauschen wie möglich. Das Handy braucht dafür eine längere Belichtung → Stativ.
          </li>
          <li>
            <strong>Weißabgleich (WB) fest</strong> auf die Kelvin-Zahl deiner Lampen, z. B. 5000 K. Dann ändert sich die Farbe nicht von Foto zu Foto.
          </li>
          <li>
            <strong>Manueller Fokus</strong> mit Fokus-Peaking (farbige Markierung, was scharf ist) – ideal für Nahaufnahmen.
          </li>
          <li>
            <strong>RAW/DNG</strong> nur, wenn du am PC bearbeitest. Für simpleArchive reicht JPEG.
          </li>
        </ul>
        <Tip title="Makro-Modus?">Der Makro-Modus vieler Handys nutzt eine kleine Extra-Linse mit wenig Auflösung. Für Details (Augen, Freihand-Schriftzug) kann er okay sein – für das Hauptfoto ist Hauptkamera + Abstand + Zuschneiden fast immer schärfer.</Tip>
      </>
    ),
  },
  {
    id: 'sharp',
    icon: 'crop',
    title: 'Schärfe & Schärfentiefe',
    teaser: 'Warum nur die Nase scharf ist – und was hilft',
    body: () => (
      <>
        <p class="lead">Bei kleinen Motiven ist nur eine dünne Scheibe scharf. Ist das Gesicht scharf und der Umhang nicht, ist das normal – ist gar nichts scharf, hat meist das Handy gewackelt.</p>
        <h3>Gegen Verwackeln</h3>
        <ul class="plain-list">
          <li>Handy nie frei halten: Mini-Stativ, Handyhalter mit Klemme, Bücherstapel oder ein Klumpen Blu-Tack.</li>
          <li>Selbstauslöser 2–3 s, einen Bluetooth-Auslöser um ein paar Euro oder die Lautstärketaste am Kabel-Kopfhörer.</li>
          <li>Mehr Licht hilft auch: Das Handy wählt dann kürzere Belichtungszeiten.</li>
        </ul>
        <h3>Mehr Schärfentiefe</h3>
        <ul class="plain-list">
          <li>
            <strong>Weiter weg und zuschneiden.</strong> Je größer der Abstand, desto mehr ist scharf. Ein 50-Megapixel-Foto verträgt kräftiges Zuschneiden.
          </li>
          <li>
            <strong>Fokus aufs Gesicht</strong> bzw. auf die vorderen Augen. Da schaut jeder zuerst hin.
          </li>
          <li>
            <strong>Einheiten in einer Ebene</strong> aufstellen, parallel zum Handy – nicht tief gestaffelt nach hinten.
          </li>
          <li>
            <strong>Focus Stacking</strong> für Große: mehrere Fotos mit Fokus vorne, Mitte, hinten, am PC zusammenrechnen (z. B. Helicon Focus, Zerene, Photoshop). Stativ Pflicht.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'angle',
    icon: 'frame',
    title: 'Perspektive & Bildaufbau',
    teaser: 'Augenhöhe, 3/4-Ansicht, die Standard-Serie',
    body: () => (
      <>
        <p class="lead">Der größte Anfängerfehler: von schräg oben fotografieren, so wie wir die Mini am Maltisch sehen. Auf Augenhöhe wirkt sie plötzlich wie eine echte Figur.</p>
        <Figure caption="Von oben (links) wird die Mini flach. Auf Augenhöhe (rechts) wirkt sie lebendig.">
          <AngleDiagram />
        </Figure>
        <ul class="plain-list">
          <li>
            <strong>Kamera auf Augenhöhe</strong> der Miniatur oder knapp darüber. Große Monster und Helden gern leicht von unten – das wirkt heroisch.
          </li>
          <li>
            <strong>3/4-Ansicht von vorne</strong> als Titelbild: Gesicht, Waffe und Pose zugleich.
          </li>
          <li>
            <strong>Base ganz im Bild</strong>, oben und unten etwas Luft. Mini mittig, gerade stehen lassen.
          </li>
          <li>
            <strong>Hochformat 4:5</strong> passt für einzelne Minis und für Instagram; Querformat für Einheiten und Gelände.
          </li>
        </ul>
        <h3>Die Standard-Serie</h3>
        <p>Für jedes fertige Werk: vorne · 3/4 links · 3/4 rechts · hinten · ein Detail (Gesicht, Schild, Freihand, Base). Ein Drehteller (oder ein Teller auf einem Lazy Susan) macht das zur Sache von einer Minute.</p>
        <h3>Einheiten & Gelände</h3>
        <ul class="plain-list">
          <li>Einheiten gestaffelt wie eine Pyramide aufstellen, Anführer vorne in der Mitte – alle Gesichter sichtbar.</li>
          <li>Gelände einmal von oben (Überblick) und einmal aus „Spieler-Sicht“ auf Tischhöhe fotografieren. Eine Mini daneben zeigt den Maßstab.</li>
          <li>Streiflicht (Lampe flach von der Seite) holt die Struktur von Stein, Holz und Trockenbürsten heraus.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'color',
    icon: 'brush',
    title: 'Farben echt halten',
    teaser: 'Weißabgleich, Metallics, NMM, OSL, Lack',
    body: () => (
      <>
        <p class="lead">Das Foto soll zeigen, was du gemalt hast. Die häufigsten Farb-Diebe: Mischlicht, falscher Weißabgleich und glänzender Lack.</p>
        <h3>Weißabgleich</h3>
        <p>
          Wenn dein weißer Hintergrund gelblich oder bläulich aussieht, stimmt der Weißabgleich nicht. Entweder im Pro-Modus fest einstellen – oder später mit der <strong>Pipette auf den Hintergrund</strong> korrigieren (Snapseed, Lightroom). Profi-Trick: Eine Graukarte (ein paar Euro) beim ersten Foto mit ins Bild stellen.
        </p>
        <h3>Metallfarben</h3>
        <p>Echtes Metall reflektiert, was um es herum ist. Mit großem, weichem Licht und ein paar Grad Drehung der Mini findest du die Stellung, in der die Kanten schön aufblitzen. Mit kleinem hartem Licht wirken Metallics oft flach und grau.</p>
        <h3>NMM, OSL & Co.</h3>
        <ul class="plain-list">
          <li>
            <strong>NMM</strong> (gemaltes Metall) ist für einen Blickwinkel gemalt – meist frontal. Genau aus dem fotografieren.
          </li>
          <li>
            <strong>OSL</strong> (gemaltes Leuchten): Umgebungslicht etwas runter und Belichtung reduzieren, dann „leuchtet“ es auch auf dem Foto. Dunkler Hintergrund hilft.
          </li>
          <li>
            <strong>Kontrastfarben & Glazes</strong> sehen mit weichem Licht am besten aus – hartes Licht betont Flecken.
          </li>
        </ul>
        <h3>Lack</h3>
        <p>
          Vor dem Foto <strong>mattlackieren</strong>: Glanz spiegelt die Lampen als weiße Flecken. Augen, Edelsteine und Blut dürfen punktuell glänzen – das wirkt dann gewollt.
        </p>
        <Tip title="Vergleich am Maltisch">Leg das Handy mit dem Foto direkt neben die Mini. Sieht die Farbe gleich aus? Wenn nicht: Weißabgleich und Belichtung nachstellen, bevor du die ganze Serie machst.</Tip>
      </>
    ),
  },
  {
    id: 'edit',
    icon: 'edit',
    title: 'Nachbearbeiten am Handy',
    teaser: 'Fünf Schritte, zwei Minuten',
    body: () => (
      <>
        <p class="lead">Nachbearbeiten heißt: das Foto dem Original näherbringen, nicht es „aufhübschen“. Filter und HDR-Look machen die Bemalung schlechter, nicht besser.</p>
        <Steps>
          {[
            <>
              <strong>Zuschneiden & gerade richten</strong> – direkt in simpleArchive: Foto öffnen → „Zuschneiden“. Das Original bleibt erhalten.
            </>,
            <>
              <strong>Weißabgleich</strong> mit der Pipette auf den Hintergrund (Snapseed: „Feinabstimmung“/„Weißabgleich“, Lightroom: „Farbe“ → Pipette).
            </>,
            <>
              <strong>Belichtung & Weißpunkt</strong>, bis der Hintergrund hell ist, aber nicht ausfrisst. Auf weißem Hintergrund darf er fast weiß werden.
            </>,
            <>
              <strong>Schatten etwas aufhellen</strong>, damit Details unter Umhängen sichtbar werden.
            </>,
            <>
              <strong>Dezent schärfen</strong> – ein bisschen reicht. Zu viel sieht nach Krümeln aus.
            </>,
          ]}
        </Steps>
        <p>
          Gut und werbefrei: <strong>Snapseed</strong> (kostenlos, ohne Konto). Mächtiger: <strong>Lightroom Mobile</strong> (Grundfunktionen gratis, Konto nötig).
        </p>
        <DoDont good={['Staub vorher mit weichem Pinsel oder Blasebalg entfernen', 'Alle Fotos einer Serie gleich bearbeiten', 'Vorher/Nachher mit dem echten Modell vergleichen']} bad={['Instagram-Filter und Sättigung +50', 'Klarheit/Struktur auf Anschlag', 'Farben „verbessern“, die du so nicht gemalt hast']} />
      </>
    ),
  },
  {
    id: 'special',
    icon: 'box',
    title: 'Spezialfälle',
    teaser: 'Große Modelle, Gelände, WIP, Armee-Fotos',
    body: () => (
      <>
        <h3>Große Modelle & Fahrzeuge</h3>
        <p>Mehr Abstand, 2× Zoom, Stativ. Zwei Lichter reichen oft nicht: ein drittes von oben oder hinten (Kantenlicht) trennt das Modell vom Hintergrund. Die Hohlkehle muss größer sein – A2 oder ein Stück Tapete.</p>
        <h3>Gelände & Spielplatten</h3>
        <p>Draußen im Schatten oder bei bewölktem Himmel: Der ganze Himmel ist dann eine riesige Softbox. Einmal von oben für den Überblick, einmal auf Tischhöhe mit Minis für Maßstab und Stimmung.</p>
        <h3>WIP-Fotos</h3>
        <p>
          Fotografiere den Fortschritt immer vom gleichen Punkt mit dem gleichen Licht (Klebeband-Markierungen!). In simpleArchive wird jedes Foto mit dem aktuellen Stand gespeichert – mit „Vorher/Nachher“ siehst du dann, wie aus Grau Farbe wurde.
        </p>
        <h3>Transparente Teile, Wasser, Effekte</h3>
        <p>Licht von hinten oder der Seite bringt Kunstharz, Wasser und Kristalle zum Leuchten. Ein kleines LED-Licht hinter der Mini wirkt Wunder.</p>
        <h3>Sehr helle und sehr dunkle Minis</h3>
        <p>Weiße Rüstungen: Belichtung runter, sonst fressen die Flächen aus. Schwarze Rüstungen: Belichtung etwas hoch und grauer statt schwarzer Hintergrund, damit die Kanten-Highlights sichtbar bleiben.</p>
        <h3>Armee-Fotos</h3>
        <p>Eine „Tribüne“ aus Büchern unter einem Tuch oder Karton: hinten höher als vorne, damit alle zu sehen sind. Viel Abstand, alles in einer Schärfe-Ebene, Licht breit und weich (zwei Lampen weiter weg).</p>
      </>
    ),
  },
  {
    id: 'studio',
    icon: 'bulb',
    title: 'Fotostudio für unter 30 €',
    teaser: 'Einkaufsliste und Karton-Lichtzelt',
    body: () => (
      <>
        <p class="lead">Vieles hast du schon zu Hause. Der Rest kostet weniger als eine Box Miniaturen.</p>
        <table class="shop">
          <tbody>
            <tr>
              <td>2 LED-Birnen „Tageslicht“ 5000 K, Ra ≥ 90 (für vorhandene Lampen)</td>
              <td>ca. 5–10 €</td>
            </tr>
            <tr>
              <td>Fotokarton A3/A2 in Weiß, Grau, Schwarz</td>
              <td>ca. 3–5 €</td>
            </tr>
            <tr>
              <td>Handyhalter/Mini-Stativ mit Klemme</td>
              <td>ca. 10 €</td>
            </tr>
            <tr>
              <td>Bluetooth-Fernauslöser</td>
              <td>ca. 3–5 €</td>
            </tr>
            <tr>
              <td>Backpapier, Klebeband, Blu-Tack, weißer Karton als Aufheller</td>
              <td>daheim</td>
            </tr>
            <tr>
              <td>Optional: Drehteller, Graukarte, LED-Panel mit einstellbarer Farbtemperatur</td>
              <td>je 8–25 €</td>
            </tr>
          </tbody>
        </table>
        <h3>Lichtzelt aus einem Karton</h3>
        <Figure caption="Karton mit Fenstern aus Backpapier, innen ein weißer Bogen, Lampen von außen.">
          <LightBoxDiagram />
        </Figure>
        <Steps>
          {[
            'Einen Umzugs- oder Versandkarton nehmen, etwa 40 × 30 × 30 cm.',
            'Aus beiden Seiten und dem Deckel große Fenster schneiden – 3 cm Rand stehen lassen.',
            'Die Fenster innen mit Backpapier bekleben.',
            'Einen weißen Karton innen im Bogen von der Rückwand zum Boden legen (Hohlkehle).',
            'Lampen von außen auf die Papierfenster richten – fertig ist das weiche Licht.',
          ]}
        </Steps>
        <Tip title="Lieber nicht">Ringlichter und „Selfie-Lichter“: direkt von vorne wirkt die Mini flach, und in Metallic-Farben und Augen spiegelt sich ein Ring.</Tip>
      </>
    ),
  },
  {
    id: 'checklist',
    icon: 'check',
    title: 'Checkliste zum Abhaken',
    teaser: 'Vom Staubwischen bis zum Taggen',
    body: () => <Checklist />,
  },
];

const CHECKLIST: { group: string; items: string[] }[] = [
  { group: 'Vorbereitung', items: ['Mattlack trocken, Staub und Fussel weg', 'Linse geputzt', 'Deckenlicht aus, Fotolampen an', 'Hintergrund als Hohlkehle, Mini 15–30 cm davor'] },
  { group: 'Kamera', items: ['Handy auf Stativ oder Bücherstapel', '2× Zoom, 20–30 cm Abstand', 'Fokus aufs Gesicht (lang drücken)', 'Belichtung leicht runter', 'Selbstauslöser 2 s, Blitz aus'] },
  { group: 'Serie', items: ['Vorne (3/4-Ansicht)', '3/4 links und rechts', 'Hinten', 'Ein Detail'] },
  { group: 'Danach', items: ['Zuschneiden und Weißabgleich', 'In simpleArchive: Status, Tags, Rezept', 'Titelbild wählen, Showcase-Karte teilen'] },
];

const CHECK_KEY = 'simplearchive.school.checklist.v1';

function Checklist() {
  const [done, setDone] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    void kvGet(CHECK_KEY).then((v) => {
      try {
        if (v) setDone(new Set(JSON.parse(v) as string[]));
      } catch {
        /* ignore */
      }
    });
  }, []);
  const toggle = (key: string) =>
    setDone((d) => {
      const n = new Set(d);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      kvSet(CHECK_KEY, JSON.stringify([...n]));
      return n;
    });
  const total = CHECKLIST.reduce((s, g) => s + g.items.length, 0);
  return (
    <>
      <p class="lead">
        {done.size} von {total} erledigt.
      </p>
      {CHECKLIST.map((g) => (
        <div key={g.group} class="check-group">
          <h3>{g.group}</h3>
          <ul class="checklist">
            {g.items.map((it) => {
              const key = `${g.group}/${it}`;
              return (
                <li key={key}>
                  <label>
                    <input type="checkbox" checked={done.has(key)} onChange={() => toggle(key)} />
                    <span>{it}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div class="sheet-buttons">
        <button
          type="button"
          class="btn ghost"
          onClick={() => {
            setDone(new Set());
            kvSet(CHECK_KEY, null);
          }}
        >
          Neu anfangen
        </button>
        <button type="button" class="btn primary" onClick={() => openSheet({ type: 'add', itemId: null })}>
          <Icon name="camera" size={18} /> Los geht's
        </button>
      </div>
    </>
  );
}

export function School() {
  return (
    <div class="school">
      <header class="tab-header">
        <div class="tab-heading">
          <h1 class="display">Fotoschule</h1>
          <p class="muted">Minis und Gelände mit dem Handy fotografieren</p>
        </div>
      </header>
      <div class="lessons">
        {LESSONS.map((l, i) => (
          <button type="button" class={`lesson-card ${i === 0 ? 'featured' : ''}`} key={l.id} onClick={() => push({ type: 'lesson', id: l.id })}>
            <span class="lesson-icon">
              <Icon name={l.icon} size={i === 0 ? 26 : 22} />
            </span>
            <span class="lesson-text">
              <strong>{l.title}</strong>
              <small>{l.teaser}</small>
            </span>
            <Icon name="next" size={18} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function LessonPage({ id }: { id: string }) {
  const idx = LESSONS.findIndex((l) => l.id === id);
  const lesson = LESSONS[idx] ?? LESSONS[0];
  const next = LESSONS[idx + 1];
  return (
    <Page title="Fotoschule" class="lesson">
      <article class="lesson-body">
        <h1 class="display">{lesson.title}</h1>
        {lesson.body()}
      </article>
      {next && (
        <button type="button" class="next-lesson" onClick={() => replaceTop({ type: 'lesson', id: next.id })}>
          <small>Weiter</small>
          <strong>{next.title}</strong>
          <Icon name="next" size={18} />
        </button>
      )}
    </Page>
  );
}
