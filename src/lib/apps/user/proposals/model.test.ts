import { expect, test } from "vitest";
import {
  add_proposal,
  create_notebook,
  create_proposal,
  filled_count,
  filter_proposals,
  ImageDisplay,
  is_empty,
  normalize_content,
  only,
  ProposalStatus,
  remove_proposal,
  set_section,
  update_proposal,
} from "./model";

const PIXEL = "data:image/webp;base64,AAAA";

test("normalize merges text, drops empties and trims the ends", () => {
  expect(
    normalize_content([{ text: "  \n" }, { text: "a" }, { text: "" }, { text: "b" }, { image: PIXEL, display: ImageDisplay.INLINE }, { text: " \n" }])
  ).toEqual([{ text: "ab" }, { image: PIXEL, display: ImageDisplay.INLINE }]);
});

test("a section counts as filled with text or a picture, not whitespace", () => {
  expect(is_empty(undefined)).toBe(true);
  expect(is_empty([{ text: " \n " }])).toBe(true);
  expect(is_empty([{ image: PIXEL, display: ImageDisplay.BLOCK }])).toBe(false);

  let proposal = create_proposal("A");
  proposal = set_section(proposal, "problem", [{ text: "x" }]);
  proposal = set_section(proposal, "does", [{ text: "  " }]);
  proposal = set_section(proposal, "picture", [{ image: PIXEL, display: ImageDisplay.INLINE }]);
  expect(filled_count(proposal)).toBe(2);
});

test("notebook edits are immutable and keep identity when nothing changes", () => {
  const first = create_proposal("One");
  const second = { ...create_proposal("Two"), status: ProposalStatus.SENT };
  const notebook = add_proposal(add_proposal(create_notebook(), first), second);
  expect(update_proposal(notebook, first.id, (proposal) => proposal)).toBe(notebook);

  const renamed = update_proposal(notebook, first.id, (proposal) => ({ ...proposal, title: "Uno" }));
  expect(renamed.proposals[0].title).toBe("Uno");
  expect(notebook.proposals[0].title).toBe("One");
  expect(renamed.proposals[1]).toBe(second);

  expect(remove_proposal(notebook, first.id).proposals).toEqual([second]);
  expect(only(notebook, second.id).proposals).toEqual([second]);
  expect(filter_proposals(notebook.proposals, ProposalStatus.SENT)).toEqual([second]);
  expect(filter_proposals(notebook.proposals, "all")).toHaveLength(2);
});
