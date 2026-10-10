import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FrequencyChart } from "./FrequencyChart";
import { VerdictBadge } from "./VerdictBadge";

it("runs the test runner", () => {
  expect(1 + 1).toBe(2);
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

  it("shows a legend only for several series", () => {
    const { rerender } = render(<FrequencyChart series={series} />);
    expect(screen.queryByText("Rev B")).not.toBeInTheDocument();
    rerender(
      <FrequencyChart series={[{ label: "Rev A", samples }, ...series]} />,
    );
    expect(screen.getByText("Rev A")).toBeInTheDocument();
    expect(screen.getByText("Rev B")).toBeInTheDocument();
  });
});
