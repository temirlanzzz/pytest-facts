// Sources of truth, preset "LLM answers" and the labelled eval set.
// All text is hand-written by me. The "LLM answers" are not real model output.
//
// The eval set has two parts:
//   tuning   - the 8 claims of the Python sample. I looked at these while picking
//              thresholds and the retrieval setup.
//   heldout  - 14 claims written (and committed) BEFORE any threshold tuning,
//              never used to pick a setting.

export const SOURCES = {
  python: `Python is a high-level, general-purpose programming language. It was created by Guido van Rossum at Centrum Wiskunde & Informatica (CWI) in the Netherlands. It was first released in 1991. Its design philosophy emphasizes code readability through significant indentation.

Python 2.0 was released in 2000 and introduced list comprehensions and a cycle-detecting garbage collector. Python 3.0 was released in December 2008. It was a major revision that is not completely backward-compatible with earlier versions. Python 2.7.18, released in 2020, was the last release of Python 2.

Van Rossum was the project's lead developer, holding the title "benevolent dictator for life", until he stepped down in July 2018. The language is named after the British comedy group Monty Python. Python is dynamically typed and garbage-collected. CPython, the reference implementation, is written in C.`,

  refunds: `Northwind Audio accepts returns within 30 days of delivery. Items must be unused and in their original packaging. Refunds are issued to the original payment method within 5 to 7 business days after the return is inspected.

Return shipping is free for customers in the United States. International customers pay their own return shipping costs. Gift cards and downloadable software cannot be returned. Headphones that have been opened can only be exchanged for the same model.

Orders over $50 qualify for free standard shipping. Our support team is available Monday to Friday, 9am to 6pm Eastern Time. They can be reached by email or live chat.`,

  eiffel: `The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris, France. It is named after the engineer Gustave Eiffel, whose company designed and built the tower. It was constructed from 1887 to 1889 as the centrepiece of the 1889 World's Fair.

Some of France's leading artists and intellectuals initially criticised its design. The tower is 330 metres tall. It was the tallest man-made structure in the world until the Chrysler Building in New York City was finished in 1930. The tower has three levels for visitors, with restaurants on the first and second levels.`,
};

// label: PASS = entailed by the source, FAIL = contradicted, SKIP = source is silent
export const TUNING = [
  { src: 'python', claim: 'Python was created by Guido van Rossum', label: 'PASS' },
  { src: 'python', claim: 'Python was first released in 1991', label: 'PASS' },
  { src: 'python', claim: 'Python is named after the comedy group Monty Python', label: 'PASS' },
  { src: 'python', claim: 'Python 3.0 is fully backward-compatible with Python 2', label: 'FAIL' },
  { src: 'python', claim: 'Python is a statically typed language', label: 'FAIL' },
  { src: 'python', claim: 'Python was created at Bell Labs in the United States', label: 'FAIL' },
  { src: 'python', claim: 'Python 2.0 was released in 2008', label: 'FAIL' },
  { src: 'python', claim: 'Python is the most popular language on GitHub', label: 'SKIP' },
];

export const HELDOUT = [
  { src: 'python', claim: 'Python was developed in the Netherlands', label: 'PASS' },
  { src: 'python', claim: 'Python 3.0 came out in 2008', label: 'PASS' },
  { src: 'python', claim: 'Guido van Rossum worked at Google', label: 'SKIP' },
  { src: 'python', claim: 'CPython is written in Java', label: 'FAIL' },
  { src: 'python', claim: 'Van Rossum stepped down as lead developer in 2018', label: 'PASS' },

  { src: 'refunds', claim: 'Customers can return items within 30 days of delivery', label: 'PASS' },
  { src: 'refunds', claim: 'Gift cards can be returned for a full refund', label: 'FAIL' },
  { src: 'refunds', claim: 'Northwind Audio offers a two-year warranty on all products', label: 'SKIP' },
  { src: 'refunds', claim: 'International customers get free return shipping', label: 'FAIL' },

  { src: 'eiffel', claim: 'The Eiffel Tower is located in Paris', label: 'PASS' },
  { src: 'eiffel', claim: 'The Eiffel Tower was built for the 1900 Olympic Games', label: 'FAIL' },
  { src: 'eiffel', claim: 'The Eiffel Tower is repainted every seven years', label: 'SKIP' },
  { src: 'eiffel', claim: "Leading artists criticised the tower's design", label: 'PASS' },
  { src: 'eiffel', claim: 'The Eiffel Tower was completed in 1899', label: 'FAIL' },
];
