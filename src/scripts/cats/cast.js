// The residents. Looks drive the 3D rig; traits drive the mind (all 0..1).
// Keys stay mint/pink/purple so older markup and storage keep matching.
export const CAST = {
  mint: {
    name: 'Miso', role: 'The caretaker', bio: 'Fluffy, soft-spoken, keeps a head count of everyone, including you.',
    traits: { energy: .5, curiosity: .5, sociable: .95, bold: .3, mischief: .1, grumpy: .05, affection: .9, lazy: .45 },
    look: {
      size: 1, fur: '#F6EEDC', shade: '#E6D7BE', belly: '#FFFAF0', stripe: null, ear: '#F2B5BE', nose: '#E98A9B',
      iris: '#7FC8A9', collar: '#8FD3B5', tag: '#F2C46D', bodyR: 18, legLen: 9, legW: 11.5, headR: 26, tailLen: 42, tailW: 10,
      spine: 13, fluffy: true, earSize: 1, eyeSize: 1.12, cheeks: 1.12,
    },
    gait: 1, voice: {
      greet: ['oh! hello.', 'you’re here :)', 'welcome in.', 'hi friend.'],
      returnLong: ['you came back!', 'we kept your seat warm.', 'i missed you.'],
      pet: ['purrrr.', 'yes, there.', 'you’re one of us now.', 'mmm.'], boop: ['boop received.', 'hehe.', 'hi!'],
      carried: ['oh! up we go.', 'gently please.'], landed: ['safe and sound.', 'thank you.'],
      treat: ['for me? really?', 'i’ll share. maybe.'], sleep: ['just resting my eyes.'], wake: ['did i miss anything?'],
      watch: ['ooh, this one.', 'shh, it’s starting.', 'good pick.'], pause: ['intermission?', 'snack break?'],
      newVideo: ['new one!', 'what are we watching?'], newcomer: ['someone new!', 'a new friend.'],
      hunt: ['a little friend!'], miss: ['next time.'], caught: ['got you. bye now.'],
      laser: ['the red one again…'], visit: ['how are you?', 'checking on you.'], stare: ['hi in there.', 'can you see me?'],
      cursorFast: ['gentle cursor, please.', 'eek.'], annoyed: ['okay, okay.'], zoomies: ['wheee!'], shelf: ['nice view up here.'],
      createHover: ['our next adventure?'], linkError: ['that link needs help.'], invite: ['summon the group chat.'],
      night: ['it’s late, you know.'], idle: ['all paws accounted for.', 'cozy.', 'everyone okay?'],
      peek: ['peekaboo.', 'just checking on you.', 'hello again.'], back: ['i’m back. did you miss me?', 'back from my rounds.'],
      glass: ['hello in there.', 'is this a window?', 'you look cozy in there.'], hidden: ['you can’t see me.'], climb: ['up we go.'],
    },
  },
  pink: {
    name: 'Mochi', role: 'The instigator', bio: 'Ginger tabby, all legs and opinions. Every cursor is prey.',
    traits: { energy: .95, curiosity: .85, sociable: .6, bold: .95, mischief: .95, grumpy: .2, affection: .55, lazy: .1 },
    look: {
      size: .98, fur: '#F0B48C', shade: '#DE9970', belly: '#FCE5D2', stripe: '#D27F55', ear: '#F2A6A9', nose: '#DB7486',
      iris: '#E7C15A', collar: '#F28DA5', tag: '#F7E08A', bodyR: 15.5, legLen: 13, legW: 9.5, headR: 24, tailLen: 58, tailW: 8,
      spine: 16, earSize: 1.12, eyeSize: 1.02, cheeks: 1,
    },
    gait: 1.35, voice: {
      greet: ['oh it’s you.', 'new toy?', 'finally.'], returnLong: ['you left. rude.', 'i ruled while you were gone.'],
      pet: ['acceptable.', 'more. faster.', 'admire the talent.'], boop: ['you boop, i bite.', 'game on.', 'try that again.'],
      carried: ['put me down. now.', 'this is a kidnapping.'], landed: ['i meant to do that.', 'ten out of ten.'],
      treat: ['MINE.', 'nobody touch it.'], sleep: ['not tired.'], wake: ['what did i miss.'],
      watch: ['turn it up.', 'this slaps.'], pause: ['who paused it.', 'unpause. now.'], music: ['watch the footwork.', 'i was born for this.'],
      newVideo: ['ooh.', 'next!'], newcomer: ['fresh audience.'], hunt: ['it’s mine.', 'don’t move…'],
      miss: ['let it go. this time.', 'tactical retreat.'], caught: ['GOT IT.', 'the hunter returns.'],
      laser: ['the dot. THE DOT.', 'it will not escape.'], visit: ['tag. you’re it.', 'wanna fight?'],
      stare: ['let me out.', 'what are YOU looking at?'], cursorStill: ['don’t. move.'], zoomies: ['ZOOM.', 'can’t stop.'],
      shelf: ['king of the website.', 'load-bearing? let’s see.'], annoyed: ['fine.'], createHover: ['press it. press it.'],
      linkError: ['that link’s broken.'], invite: ['more humans.'], night: ['night = hunting time.'], idle: ['bored.', 'what now.'],
      peek: ['boo.', 'miss me?', 'you didn’t see me.'], back: ['i’m back. chaos resumes.', 'did someone say snacks?'],
      glass: ['let me OUT.', 'what’s this button do?', 'tap tap tap.'], hidden: ['shhh. hiding.'], knock: ['oops.', 'gravity check.', 'it was like that.'],
      climb: ['parkour!'],
    },
  },
  purple: {
    name: 'Pixel', role: 'The critic', bio: 'Lavender, large, unimpressed. Needs excellent cinema and personal space.',
    traits: { energy: .3, curiosity: .45, sociable: .3, bold: .6, mischief: .3, grumpy: .9, affection: .3, lazy: .85 },
    look: {
      size: 1.12, fur: '#BDB0DC', shade: '#A497C6', belly: '#E5DDF3', stripe: '#A090C8', ear: '#E8B4C8', nose: '#C9849D',
      iris: '#F0B860', collar: '#F2C46D', tag: '#8FD3B5', bodyR: 20, legLen: 8, legW: 12, headR: 26, tailLen: 40, tailW: 11,
      spine: 13, earSize: .85, eyeSize: 1, cheeks: 1.22, lidded: .38,
    },
    gait: .75, voice: {
      greet: ['oh. it’s you.', 'hm.', 'you may stay.'], returnLong: ['i didn’t notice you were gone.', 'took you long enough.'],
      pet: ['this changes nothing.', 'acceptable, human.', 'two more seconds.'], boop: ['excuse me.', 'personal space.', 'noted.'],
      petMax: ['that’s enough.', 'we’re done here.'], carried: ['i have a lawyer.', 'unhand me.'], landed: ['undignified.', 'never again.'],
      treat: ['finally, service.', 'five stars.'], sleep: ['do not disturb.'], wake: ['i was not asleep.'],
      watch: ['hm. derivative.', 'the cinematography…', 'i’ll allow it.'], pause: ['who paused my cinema?', 'unacceptable.'],
      music: ['technically off-beat.'], newVideo: ['let’s see.', 'this better be good.'], newcomer: ['another witness.'],
      hunt: ['fine. one hunt.'], miss: ['i let it go.'], caught: ['effortless.'], laser: ['i know it’s you.', 'beneath me.'],
      visit: ['move.', 'you’re in my spot.'], hiss: ['HSSS.', 'back. off.'], stare: ['are you watching me?', 'blink first.'],
      shelf: ['the high ground.'], annoyed: ['ugh.'], createHover: ['make it a good one.'], linkError: ['tragic link.'],
      invite: ['must we?'], night: ['go to bed.'], idle: ['…', 'i supervise.', 'waiting aggressively.'],
      peek: ['i see you.', 'still here.', 'don’t mind me.'], back: ['the outside was overrated.', 'i have returned.'],
      glass: ['your screen is filthy.', 'i see everything.', 'clean this.'], hidden: ['i am not hiding.'], climb: ['ugh. stairs.'],
    },
  },
  black: {
    name: 'Bean', role: 'The resident', bio: 'A curious little shadow. Soft paws, warm company, occasional mischief.',
    traits: { energy: .62, curiosity: .9, sociable: .85, bold: .48, mischief: .38, grumpy: 0, affection: .92, lazy: .52 },
    // Seconds between starts, plus the attention each unsolicited spectacle costs.
    // Recovery happens during quieter activities, so antics have breathing room.
    pacing: {
      cooldowns: { glass: 210, leave: 240, hide: 100, knock: 110, dance: 100, zoomies: 135,
        stalk: 55, approach: 40, stare: 60, explore: 40, hunt: 70 },
      attentionCost: { glass: 1, leave: .9, hide: .6, knock: .7, dance: .65,
        zoomies: .85, stalk: .55, hunt: .65, explore: .2 },
      videoRecovery: 120, idleRecovery: 35,
    },
    look: {
      size: .7, fur: '#3E3749', shade: '#2E2836', belly: '#F7F1E6', stripe: null, ear: '#E9A7B4', nose: '#E98A9B',
      iris: '#9FD47F', collar: '#7FB8F0', tag: '#F2C46D', bodyR: 13.5, legLen: 7.5, legW: 9, headR: 24, tailLen: 34, tailW: 7,
      spine: 10, earSize: 1.12, eyeSize: 1.3, cheeks: 1, tuxedo: true, outline: '#1F1A26',
    },
    gait: .96, voice: {
      greet: ['oh, hello.', 'a friend :)', 'room for one more?'], returnLong: ['there you are.', 'saved you a spot.'],
      pet: ['prrr.', 'that’s the spot.', 'stay a little.'], boop: ['boop!', 'hehe.', 'my nose.'], carried: ['oh, up we go.', 'a new view.'],
      refuseGrab: ['not up. paws here.', 'no uppies right now.'], fleeGrab: ['too fast! give me a sec.'],
      spaceGrab: ['a little space, please.'],
      landed: ['soft landing.', 'thank you.'], treat: ['for me?', 'a little snack.'], sleep: ['five more minutes.'],
      wake: ['just stretching.'], watch: ['ooh, this bit.', 'i’m watching too.'], pause: ['little break?'], music: ['tiny dance.'],
      newVideo: ['ooh, a new one.'], newcomer: ['a new friend!!'], hunt: ['just a closer look.'], miss: ['nearly.'], caught: ['did you see?'],
      laser: ['what IS it?!'], visit: ['play with me!', 'wait for me!'], stare: ['hello in there!', 'peekaboo.'],
      zoomies: ['little burst!'], shelf: ['a good spot.'], createHover: ['coming with you.'], linkError: ['uh oh.'], invite: ['more friends!'],
      night: ['getting cozy.'], idle: ['what’s that?', 'nice here.'],
      peek: ['peek.', 'still here.', 'found you.'], back: ['back again.', 'quite nice out there.'],
      glass: ['hello in there.', 'a little closer?', 'nose to nose.'], hidden: ['my little nook.'], knock: ['uh oh.'],
      climb: ['one paw at a time.'],
    },
  },
};

export const KINDS = Object.keys(CAST);
// Only these residents are created or shown on the site. Keep the character
// catalog separate so older saved memories and rig definitions remain valid.
export const ACTIVE_KINDS = ['black'];

// Words for the "meet the cats" panel. Picks the strongest traits.
const TRAIT_WORDS = {
  energy: ['sleepy', 'energetic'], curiosity: ['incurious', 'curious'], sociable: ['solitary', 'social'], bold: ['shy', 'bold'],
  mischief: ['well-behaved', 'mischievous'], grumpy: ['sweet', 'grumpy'], affection: ['aloof', 'cuddly'], lazy: ['restless', 'lazy'],
};
export function traitWords(traits, count = 3) {
  return Object.entries(traits).map(([key, value]) => ({ key, strength: Math.abs(value - .5), word: TRAIT_WORDS[key][value >= .5 ? 1 : 0] }))
    .sort((a, b) => b.strength - a.strength).slice(0, count).map(t => t.word);
}
