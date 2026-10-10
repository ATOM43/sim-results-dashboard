import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
