\\ Route queries over a small directed transport network, including failures.
(defprolog aot.edge
  depot north <--;
  north market <--;
  market station <--;
  depot west <--;
  west school <--;
  school station <--;
  station airport <--;)
(defprolog aot.route
  X Y <-- (aot.edge X Y);
  X Y <-- (aot.edge X Z) (aot.route Z Y);)
(define aot.rules
  _ -> [(prolog? (aot.route depot airport))
        (prolog? (aot.route west airport))
        (prolog? (aot.route north school))
        (prolog? (aot.route station depot))
        (prolog? (aot.route market station))
        (prolog? (findall Destination (aot.route depot Destination) Routes) (return Routes))
        (prolog? (findall Destination (aot.route airport Destination) Routes) (return Routes))])
