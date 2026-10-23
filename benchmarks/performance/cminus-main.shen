(tc -)
(define cf.cminus-request
  Input -> (compile (fn <program>) Input))
(define cf.rebinding
  X -> (+ X 1))
(define cf.binding-caller
  X -> (cf.rebinding X))
(set *cf.effects* [cminus | (value *cf.effects*)])
