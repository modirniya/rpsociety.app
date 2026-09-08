"""Every word of the site lives here; build.py turns it into HTML.

The rules described below are RPS Mafia's own — they are read off the engine's specification, not
copied from anyone else's version of the game. Where a competitor's page says "usually" or "most
groups play it this way", these pages can say what the server actually does, which is the whole
reason this content can win. Keep it that way: if a rule changes in the engine, change it here.

Only roles production actually deals appear as pages. Mayor, Psychiatrist and Negotiator are
implemented but gated off, so they get an honest note on the roles hub and nothing more — a page
for a role nobody can be dealt is a page that lies.
"""

SITE = "https://rpsociety.app"
PLAY = "https://play.rpsociety.app/"
NAME = "RPS Mafia"

# --------------------------------------------------------------------------------------------
# Roles — production set. `night` is what the role does after dark, `day` what it brings to the
# argument, `quirk` the one thing about it people get wrong elsewhere.
# --------------------------------------------------------------------------------------------

ROLES = [
    {
        "slug": "godfather",
        "name": "Godfather",
        "team": "mafia",
        "tagline": "Holds the trigger, reads as innocent, and shrugs off the bullet.",
        "counts": "In every game, at every size from five to twelve.",
        "night": "Chooses who the mafia kill. The mafia land exactly one kill a night and exactly "
                 "one of them is offered it — while the Godfather lives, that is always him.",
        "day": "He has to argue like a townsperson, and he is the one player who can survive being "
               "investigated and shot, so he can afford to be visible in a way his team cannot.",
        "quirk": "Two separate immunities, and they are often confused. The Detective investigating "
                 "the Godfather is told he is town — that is inquiry immunity. The Sniper shooting "
                 "the Godfather achieves nothing at all: he lives, and because the target really was "
                 "mafia the Sniper takes no penalty for it either. He is visible and targetable. He "
                 "is simply bulletproof.",
        "body": [
            ("Why the five-player game has no Detective",
             "At five players the mafia team is the Godfather alone. An investigation can only ever "
             "return \"town\", so the Detective would be dead weight and the game deals a Doctor and "
             "three Citizens instead. The Detective first appears at six players, where there is a "
             "plain Mafia for him to catch."),
            ("Succession",
             "If the Godfather dies, the trigger passes to the first living plain Mafia in seat "
             "order. Nothing is announced and nothing is stored — the game works out who holds it "
             "from who is still alive. The mafia never lose their kill while one of them is "
             "breathing."),
        ],
    },
    {
        "slug": "mafia",
        "name": "Mafia",
        "team": "mafia",
        "tagline": "The other killer at the table, and the Godfather's successor.",
        "counts": "One from six players, two from eight.",
        "night": "Kills, but only when the trigger has passed down to them. While the Godfather "
                 "lives, a plain Mafia gets an advisory pick instead — a suggestion their team can "
                 "see, which never commits the kill.",
        "day": "No immunities of any kind. A plain Mafia investigated by the Detective comes back "
               "mafia, and shot by the Sniper dies. They survive by argument alone.",
        "quirk": "The advisory pick is unusual and worth understanding. Rather than benching the "
                 "non-leading killers, the game lets them point at a target. Their team sees who is "
                 "pointing where, and sees a distinct mark on the leader's binding choice. It is "
                 "coordination without a second trigger.",
        "body": [
            ("One kill, one writer",
             "There is no merging of two mafia choices and no last-click-wins race. The kill lives "
             "in a single slot that only the current trigger-holder can write to. If they choose "
             "nobody, or run out of time, the night passes with no kill at all and the town learns "
             "nothing from the silence."),
        ],
    },
    {
        "slug": "dr-lecter",
        "name": "Dr. Lecter",
        "team": "mafia",
        "tagline": "The mafia's own medic. Twelve-player games only.",
        "counts": "Only at twelve players, where the mafia team is four.",
        "night": "Shields one member of his own team from the Sniper. He may shield himself, but "
                 "only once in the entire game — after that he drops out of his own picker.",
        "day": "He is mafia, so he wins with them, but he is not a killer. His whole job is keeping "
               "the killers alive through a Sniper who is hunting them.",
        "quirk": "He is the fourth mafia slot, and that is why he appears nowhere below twelve "
                 "players. Below that, every mafia slot goes to a killer instead. A team of three "
                 "cannot afford to spend one of them on protection; a team of four can.",
        "body": [
            ("When the last mafioso standing is a doctor",
             "If every dedicated killer is dead and Lecter is the last one left, he inherits the "
             "night shot — and then does both. The game offers him the binding kill first, and once "
             "he has committed it his screen advances to his own save. The mafia's one kill lands "
             "for as long as any of them lives."),
        ],
    },
    {
        "slug": "doctor",
        "name": "Doctor",
        "team": "town",
        "tagline": "The only reason anyone survives the night.",
        "counts": "In every game, at every size from five to twelve.",
        "night": "Picks who to protect from the kill. In a big game that is two different people; "
                 "in a small one, a single choice.",
        "day": "Nobody knows he exists until he claims, and claiming makes him the next night's "
               "target. Most of his value is spent deciding when that trade is worth it.",
        "quirk": "The number of saves scales with the table, and it is recalculated every night "
                 "against the living count — not the starting one. While ten or more players are "
                 "alive he protects two; the night that count falls to nine he is down to one. A "
                 "twelve-player game therefore tightens as it thins.",
        "body": [
            ("Self-healing, and its one limit",
             "The Doctor may include himself. What he cannot do is protect himself two nights "
             "running — the game remembers he did it and refuses the repeat. So a Doctor who has "
             "just saved his own life is exposed on the following night, which is exactly when a "
             "mafia team that suspects him will come back."),
        ],
    },
    {
        "slug": "detective",
        "name": "Detective",
        "team": "town",
        "tagline": "One question a night, and a lie waiting in the answers.",
        "counts": "From six players upward.",
        "night": "Investigates one player and is told, privately, whether they are mafia or town.",
        "day": "He holds the only hard information in the game, and the moment he uses it he "
               "identifies himself to the people who most want him dead.",
        "quirk": "The Godfather comes back as town. Every game, without exception. A Detective who "
                 "does not account for this will eventually clear the most dangerous player at the "
                 "table and stake his credibility on it.",
        "body": [
            ("What a result is actually worth",
             "The reading is alignment only — mafia or town — never the specific role. A \"mafia\" "
             "result is close to conclusive and worth acting on immediately. A \"town\" result is "
             "much weaker than it looks, because it is also what the Godfather returns. Clearing "
             "someone on one investigation is how towns lose."),
            ("Why he arrives at six players",
             "At five the only mafioso is the Godfather, who is immune, so investigation cannot "
             "return anything useful. From six there is a plain Mafia in the game — someone the "
             "Detective can actually catch — and he joins the distribution."),
        ],
    },
    {
        "slug": "sniper",
        "name": "Sniper",
        "team": "town",
        "tagline": "A gun the town can point at its own foot.",
        "counts": "From seven players upward.",
        "night": "Shoots one player. If the target was mafia, they die. If the target was town, the "
                 "Sniper dies instead.",
        "day": "He is a second kill the mafia cannot predict, and a liability the town cannot "
               "control. Sniping on a hunch costs two townspeople: the innocent target's trust, and "
               "the Sniper himself.",
        "quirk": "Shooting the Godfather does nothing whatsoever. No kill, and no penalty — because "
                 "the target genuinely was mafia, the Sniper is not punished for it. The bullet "
                 "simply fails. A silent night with no body is a real and confusing outcome.",
        "body": [
            ("The shot is a claim as much as an action",
             "A successful shot tells the whole table that a Sniper exists and that his read was "
             "good. A failed one takes him off the board and hands the mafia a free night. Because "
             "of the Godfather's immunity, even a correct read can produce nothing at all, which is "
             "the hardest thing about the role to play around."),
        ],
    },
    {
        "slug": "die-hard",
        "name": "Die-hard",
        "team": "town",
        "tagline": "One extra life, spent on whatever comes first.",
        "counts": "At six players, and again from nine through twelve.",
        "night": "Nothing. He has no night action and never wakes.",
        "day": "An ordinary voter with a secret — he can absorb one attempt on his life, and he does "
               "not choose which one.",
        "quirk": "The charge is shared between night and day. It stops the first night kill aimed at "
                 "him or the first lynch that lands on him, whichever happens first, and then it is "
                 "gone. Being voted out on day one wastes the same armour that could have survived "
                 "a mafia kill on night three.",
        "body": [
            ("Why he shows up where he does",
             "One extra town life is a small, blunt advantage, so the distribution uses him to "
             "smooth the ladder rather than to add another power. He appears at six, disappears "
             "through the seven and eight-player games where kill output is tight, and returns from "
             "nine upward where the town can carry him."),
        ],
    },
    {
        "slug": "citizen",
        "name": "Citizen",
        "team": "town",
        "tagline": "No power, no information, and the hardest job at the table.",
        "counts": "Between one and four of them, depending on the size of the game.",
        "night": "Nothing at all. Citizens sleep through every night and learn what happened when "
                 "everyone else does.",
        "day": "Everything. A Citizen's only instruments are the argument, the vote, and what he can "
               "infer from who is pushing whom.",
        "quirk": "Being useless at night is what makes the Citizen useful during the day. He has "
                 "nothing to protect and no result to defend, so he can push hard on a suspicion "
                 "that a Doctor or Detective would have to be careful about. He is also the only "
                 "role a mafioso can claim without immediately being asked for evidence.",
        "body": [],
    },
]

GATED_ROLES = ["Mayor", "Psychiatrist", "Negotiator"]

# --------------------------------------------------------------------------------------------
# Setups — exactly what the server deals at each size. Do not round these off or improvise.
# --------------------------------------------------------------------------------------------

SETUPS = [
    {"n": 5, "mafia": ["Godfather"],
     "town": ["Doctor"], "citizens": 3, "killers": 1,
     "note": "The smallest game the engine will run. One mafioso, and no Detective — investigation "
             "cannot return anything but \"town\" against a lone Godfather, so the slot goes to a "
             "Citizen instead.",
     "feel": "Brutally short and almost pure argument. With one killer and one Doctor, a single "
             "correct save can swing the whole game."},
    {"n": 6, "mafia": ["Godfather", "Mafia"],
     "town": ["Doctor", "Detective", "Die-hard"], "citizens": 1, "killers": 2,
     "note": "The Detective arrives, because there is finally a plain Mafia for him to catch. "
             "Die-hard comes with him to absorb an early mistake.",
     "feel": "Dense. Four of the six players have something to do at night, so almost nothing that "
             "happens is noise."},
    {"n": 7, "mafia": ["Godfather", "Mafia"],
     "town": ["Doctor", "Detective", "Sniper"], "citizens": 2, "killers": 2,
     "note": "The Sniper's first appearance, and the point where the town gains a second way to "
             "kill. Die-hard steps aside to keep the balance honest.",
     "feel": "Sharp. Two mafia against a town that can now shoot back, and a Godfather who is "
             "immune to the shot."},
    {"n": 8, "mafia": ["Godfather", "Mafia", "Mafia"],
     "town": ["Doctor", "Detective", "Sniper"], "citizens": 2, "killers": 3,
     "note": "A third killer joins. From here the mafia can afford to lose a member and still "
             "threaten a kill every night.",
     "feel": "The most common size, and arguably the best. Big enough for real argument, small "
             "enough that every death matters."},
    {"n": 9, "mafia": ["Godfather", "Mafia", "Mafia"],
     "town": ["Doctor", "Detective", "Sniper", "Die-hard"], "citizens": 2, "killers": 3,
     "note": "Die-hard returns. The mafia stay at three, so the town gains ground here rather than "
             "the mafia.",
     "feel": "The town's strongest size on paper, which tends to make the mafia play quietly and "
             "wait for the town to lynch itself."},
    {"n": 10, "mafia": ["Godfather", "Mafia", "Mafia"],
     "town": ["Doctor", "Detective", "Sniper", "Die-hard"], "citizens": 3, "killers": 3,
     "note": "Ten alive is the threshold where the Doctor protects two people a night instead of "
             "one — and he keeps doing so only while the count stays there.",
     "feel": "Loud. Ten voices is enough that a quiet player is genuinely hard to spot, and the "
             "double save makes the first night or two unpredictable."},
    {"n": 11, "mafia": ["Godfather", "Mafia", "Mafia"],
     "town": ["Doctor", "Detective", "Sniper", "Die-hard"], "citizens": 4, "killers": 3,
     "note": "Still three mafia against a growing town. The extra body is a Citizen, so the town "
             "gets numbers without gaining information.",
     "feel": "The mafia are outnumbered badly enough that misdirection matters more than kills."},
    {"n": 12, "mafia": ["Godfather", "Mafia", "Mafia", "Dr. Lecter"],
     "town": ["Doctor", "Detective", "Sniper", "Die-hard"], "citizens": 4, "killers": 3,
     "note": "The only game with a fourth mafioso, and the only one with Dr. Lecter. He is not a "
             "killer — the team still lands three killers' worth of threat and gains a medic who "
             "shields them from the Sniper.",
     "feel": "The full game. Every role in the production set is on the table at once, and the "
             "Doctor starts on two saves a night."},
]

# --------------------------------------------------------------------------------------------
# Glossary
# --------------------------------------------------------------------------------------------

GLOSSARY = [
    ("Alignment", "Which side a player wins with — mafia or town. It is what the Detective learns, "
                  "and it is never the same thing as the player's role."),
    ("Count reveal", "A vote the whole table takes on whether to be told how many mafia and how many "
                     "townspeople are still alive. Majority yes reveals it."),
    ("Day", "The talking phase. Everyone who is alive speaks in turn, then the table votes someone "
            "out."),
    ("Day zero", "The opening day. Everyone introduces themselves and there is no vote — nobody has "
                 "died yet, so there is nothing to go on."),
    ("Die-hard armour", "The single charge that lets the Die-hard survive one attempt on his life, "
                        "night kill or lynch, whichever reaches him first."),
    ("Inquiry immunity", "The Godfather's property of returning \"town\" to every investigation."),
    ("Kill authority", "The single mafioso who is actually offered the kill on a given night. The "
                       "Godfather while he lives, then the first living plain Mafia in seat order."),
    ("Lynch", "The elimination that ends a day, decided by majority vote. A tie eliminates nobody."),
    ("Night", "The phase where roles act in private — the kill, the saves, the investigation, the "
              "shot."),
    ("Night zero", "The first night. The mafia meet each other and no one is killed."),
    ("Parity", "The mafia win condition: the moment the mafia are equal in number to everyone else, "
               "the game is over."),
    ("Recap", "A short beat after each resolving phase where the table is told what actually "
              "happened — who died, how the vote fell, what the count reveal decided."),
    ("Right to reply", "A speaker's option to hand one out-of-turn micro-turn to someone else, "
                       "taken immediately after their own. One per player per day, no nesting."),
    ("Role reveal", "The opening beat where each player privately sees their own role card before "
                    "the first day begins."),
    ("Seat order", "The order players joined the table. It decides who inherits the kill and it "
                   "never changes."),
    ("Speaking order", "Who talks when during a day. It is reshuffled each day rather than fixed, "
                       "so the same player is not always first or last."),
    ("Two-stage voting", "An optional day format: an opening vote, then a defence from whoever is "
                         "accused, then a final vote."),
]

# --------------------------------------------------------------------------------------------
# FAQ blocks, reused as FAQPage structured data
# --------------------------------------------------------------------------------------------

FAQ_HOME = [
    ("Is it free?", "Yes. There is nothing to buy, and no advantage anyone can pay for."),
    ("Do I need to download anything?",
     "No. It runs in the browser on a phone or a computer. There is no app to install and no "
     "extension to add."),
    ("Do I need Discord or Zoom?",
     "No. Voice is part of the game. The server decides who can speak and when, which is something "
     "a separate call cannot do for you."),
    ("How many players do I need?",
     "Between five and twelve. Eight is the size most groups settle on."),
    ("What if I do not have a group?",
     "Join a game night. You reserve a slot, show up, and the server matches you into a full table "
     "of people in the same language."),
    ("How old do I need to be?",
     "13 or over. The game asks for your date of birth the first time you open it, works out your "
     "age, and then discards the date — it is never stored and never leaves your device. The "
     "reason for the limit is that this is a live voice game played with people you have not met."),
    ("How long does a game take?",
     "Usually somewhere between twenty and forty minutes, depending on the size of the table and "
     "how much the argument runs."),
]

FAQ_RULES = [
    ("How many mafia are there?",
     "One at five players, two at six and seven, three from eight through eleven, and four at "
     "twelve. Only three of the four at twelve are killers."),
    ("Can the Doctor save himself?",
     "Yes, but not on two consecutive nights. Once he has protected himself, he cannot do it again "
     "the following night."),
    ("Does the Detective always get the truth?",
     "The result is never a lie, but it is not always the whole truth. The Godfather returns "
     "\"town\" every time he is investigated."),
    ("What happens if the vote ties?",
     "Nobody is eliminated and the day ends. A tie is a real outcome, not a re-vote."),
    ("Who wins?",
     "The town wins the moment the last mafioso is eliminated. The mafia win the moment their "
     "number equals everyone else's."),
    ("Can I play without a narrator?",
     "There is no narrator. The server runs the night, resolves every action and tells each player "
     "only what they are entitled to know."),
]

FAQ_NIGHTS = [
    ("What is a game night?",
     "A scheduled table you reserve a seat at. When the time comes, whoever showed up is matched "
     "into full games and the table starts itself."),
    ("Do I need to bring anyone?",
     "No. Game nights exist precisely for people who do not have eight friends free at the same "
     "time."),
    ("How often do they run?",
     "Every three hours, around the clock, so there is always one within a couple of hours "
     "wherever you are."),
    ("What if not enough people turn up?",
     "The night is called off rather than run badly, and you are offered the next slot that has "
     "room."),
    ("Do I have to be there on time?",
     "You need to be on the screen inside the check-in window shortly before it starts. Being there "
     "is the check-in — there is nothing to press."),
]
