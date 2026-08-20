export type EditStepId =
  | 'hub'
  | 'profilePhoto'
  | 'bio'
  | 'photos'
  | 'interests'
  | 'mentor'
  | 'injury'
  | 'lifeNow'
  | 'askMeAbout';

export interface EditSection {
  id: Exclude<EditStepId, 'hub'>;
  title: string;
  description: string;
}

export const EDIT_SECTIONS: EditSection[] = [
  { id: 'profilePhoto', title: 'Profile photo', description: 'The photo on your card' },
  { id: 'bio', title: 'In your own words', description: 'The three lines on your card' },
  { id: 'photos', title: 'Your photos', description: 'Doing things you enjoy' },
  { id: 'interests', title: 'Interests & activities', description: 'What you’re into' },
  { id: 'mentor', title: 'Do you want to be a mentor?', description: 'One question, asked once' },
  { id: 'injury', title: 'Your injury', description: 'Type, level, how it happened' },
  { id: 'lifeNow', title: 'Life now', description: 'Independence, work, family' },
  { id: 'askMeAbout', title: 'Ask me about', description: 'Topics and self-care' },
];
