(tc -)
(define cf.interpreter-expression
  0 -> 0
  N -> [let (protect X) (cf.interpreter-expression (- N 1)) [++ (protect X)]])
(define cf.interpreter-request
  Depth -> (normal-form (cf.interpreter-expression Depth)))
(define cf.rebinding
  X -> (+ X 1))
(define cf.binding-caller
  X -> (cf.rebinding X))
(set *cf.effects* [interpreter | (value *cf.effects*)])
