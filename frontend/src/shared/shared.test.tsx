import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FrequencyChart } from "./FrequencyChart";
import { hz, mm, signedMm } from "./format";
import { VerdictBadge } from "./VerdictBadge";

it("runs the test runner", () => {
  expect(1 + 1).toBe(2);
});

it("formats values to one or two decimals", () => {
  expect(mm(19.9)).toBe("19.9 mm");
  expect(mm(15.04)).toBe("15.04 mm");
  expect(mm(15)).toBe("15.0 mm");
  expect(hz(37.8)).toBe("37.8 Hz");
  expect(signedMm(0.04)).toBe("+0.04 mm");
  expect(signedMm(-7)).toBe("−7.0 mm");
});

describe("VerdictBadge", () => {
  it.each(["PASS", "FAIL"] as const)(
    "renders %s as text plus its own icon",
    (verdict) => {
      const { container } = render(<VerdictBadge verdict={verdict} />);
      expect(screen.getByText(verdict)).toBeInTheDocument();
      expect(
        container.querySelector(`svg[data-verdict-icon="${verdict}"]`),
      ).toBeInTheDocument();
    },
  );

  it("uses a different icon for PASS and FAIL", () => {
    const icon = (verdict: "PASS" | "FAIL") =>
      render(<VerdictBadge verdict={verdict} />).container.querySelector("svg")!
        .innerHTML;
    expect(icon("PASS")).not.toBe(icon("FAIL"));
  });

  it("styles PASS and FAIL differently, on top of the text and icon", () => {
    render(<VerdictBadge verdict="PASS" />);
    render(<VerdictBadge verdict="FAIL" />);
    const pass = screen.getByText("PASS");
    const fail = screen.getByText("FAIL");
    expect(pass).toHaveClass("text-success-foreground");
    expect(fail).not.toHaveClass("text-success-foreground");
    expect(fail).toHaveAttribute("data-variant", "destructive");
  });
});

describe("FrequencyChart", () => {
  const samples = [
    { frequency_hz: 10, magnitude_mm: 4, assessed: true },
    { frequency_hz: 37.8, magnitude_mm: 22, assessed: true },
    { frequency_hz: 50, magnitude_mm: 9, assessed: true },
    { frequency_hz: 50.5, magnitude_mm: 12, assessed: false },
    { frequency_hz: 120, magnitude_mm: 30, assessed: false },
  ];
  const series = [
    {
      label: "Rev B",
      samples,
      peak: { magnitude_mm: 22, frequency_hz: 37.8 },
    },
  ];

  it("labels the peak, limit and assessed band without hovering", () => {
    render(<FrequencyChart series={series} />);
    expect(screen.getByText("22.0 mm @ 37.8 Hz")).toBeInTheDocument();
    expect(screen.getByText("15.0 mm limit")).toBeInTheDocument();
    expect(screen.getByText("Assessed")).toBeInTheDocument();
    expect(screen.getByText("Frequency (Hz)")).toBeInTheDocument();
    expect(screen.getByText("Magnitude (mm)")).toBeInTheDocument();
  });

  it("fills assessed dots and leaves dots above 50 Hz hollow", () => {
    const { container } = render(<FrequencyChart series={series} />);
    const fills = (assessed: boolean) =>
      [
        ...container.querySelectorAll(`circle[data-assessed="${assessed}"]`),
      ].map((c) => c.getAttribute("fill"));
    expect(fills(true)).toEqual(Array(3).fill("var(--chart-5)"));
    expect(fills(false)).toEqual(Array(2).fill("var(--background)"));
  });

  it("keeps the peak label off the limit line and the limit off the top edge", () => {
    const labelIsAbove = (magnitude_mm: number) => {
      const { container, unmount } = render(
        <FrequencyChart
          series={[
            { label: "r", samples, peak: { magnitude_mm, frequency_hz: 37.8 } },
          ]}
        />,
      );
      const attr = (el: Element | null, name: string) =>
        Number(el!.getAttribute(name));
      const dotY = attr(
        container.querySelector(".recharts-reference-dot circle"),
        "cy",
      );
      const text = screen.getByText(/ mm @ /).closest("text");
      const textY = attr(text, "y") + attr(text, "dy");
      const limitY = attr(
        container.querySelector(".recharts-reference-line line"),
        "y1",
      );
      // samples peak at 30 mm, so the axis tops out at 36 and the 15 mm limit sits mid-plot
      expect(limitY).toBeGreaterThan(60);
      // the label is on the far side of the marker from the limit line
      expect(Math.abs(textY - limitY)).toBeGreaterThan(Math.abs(dotY - limitY));
      unmount();
      return textY < dotY;
    };
    expect(labelIsAbove(22)).toBe(true);
    expect(labelIsAbove(15.5)).toBe(true);
    expect(labelIsAbove(15)).toBe(false);
    expect(labelIsAbove(13.8)).toBe(false);
  });

  it("labels the peak only for a single series, where labels cannot overlap", () => {
    const { container } = render(
      <FrequencyChart series={[{ ...series[0], label: "Rev A" }, ...series]} />,
    );
    expect(screen.queryByText(/ mm @ /)).not.toBeInTheDocument();
    expect(
      container.querySelectorAll(".recharts-reference-dot circle"),
    ).toHaveLength(2);
  });

  describe("zoom toggle", () => {
    const dotX = (container: HTMLElement) =>
      [...container.querySelectorAll("circle[data-assessed]")].map((c) =>
        Number(c.getAttribute("cx")),
      );
    const range = (name: string) => screen.getByRole("radio", { name });

    it("starts at 0–200 Hz and stretches 0–50 Hz over the plot when zoomed", () => {
      const { container } = render(<FrequencyChart series={series} />);
      const width = Number(
        container.querySelector("svg.recharts-surface")!.getAttribute("width"),
      );
      expect(range("0–200 Hz")).toBeChecked();
      const full = dotX(container);
      // every sample, up to 120 Hz, is inside the plot
      expect(Math.max(...full)).toBeLessThan(width);

      fireEvent.click(range("Zoom 0–50 Hz"));
      expect(range("Zoom 0–50 Hz")).toBeChecked();
      expect(range("0–200 Hz")).not.toBeChecked();
      const zoomed = dotX(container);
      // the same span of frequencies now covers four times the width
      expect(zoomed[2] - zoomed[0]).toBeCloseTo((full[2] - full[0]) * 4);
      // the 50 Hz sample is the last one inside the plot; 120 Hz is off to the right
      expect(zoomed[2]).toBeLessThan(width);
      expect(zoomed[4]).toBeGreaterThan(width);

      fireEvent.click(range("0–200 Hz"));
      expect(dotX(container)).toEqual(full);
    });

    it("keeps the zoom when the active range is pressed again", () => {
      const { container } = render(<FrequencyChart series={series} />);
      const full = dotX(container);
      fireEvent.click(range("0–200 Hz"));
      expect(range("0–200 Hz")).toBeChecked();
      expect(dotX(container)).toEqual(full);
    });

    it("zooms to the assessed range it was given", () => {
      render(<FrequencyChart series={series} assessMaxHz={80} />);
      expect(range("Zoom 0–80 Hz")).toBeInTheDocument();
    });
  });

  describe("tooltip", () => {
    afterEach(() => vi.restoreAllMocks());

    it("names the frequency, the value and whether the sample is assessed", async () => {
      // jsdom lays nothing out; Recharts needs a chart box to turn the pointer into a sample.
      const box = { x: 0, y: 0, left: 0, top: 0, right: 320, bottom: 200 };
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        ...box,
        width: 320,
        height: 200,
        toJSON: () => box,
      });
      vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(
        320,
      );
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(
        200,
      );
      const { container } = render(<FrequencyChart series={series} />);
      const chart = container.querySelector(".recharts-wrapper")!;
      const dots = container.querySelectorAll("circle[data-assessed]");
      const hover = (dot: Element) =>
        fireEvent.mouseMove(chart, {
          clientX: Number(dot.getAttribute("cx")),
          clientY: Number(dot.getAttribute("cy")),
        });
      expect(screen.queryByText(/assessed$/)).not.toBeInTheDocument();

      hover(dots[1]);
      expect(await screen.findByText("37.8 Hz")).toBeInTheDocument();
      expect(screen.getByText("Rev B: 22 mm · assessed")).toBeInTheDocument();

      hover(dots[4]);
      expect(await screen.findByText("120 Hz")).toBeInTheDocument();
      expect(
        screen.getByText("Rev B: 30 mm · not assessed"),
      ).toBeInTheDocument();
    });
  });
});
