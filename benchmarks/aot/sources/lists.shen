(define aot.filter
  _ [] -> []
  P [X | Xs] -> (if (P X) [X | (aot.filter P Xs)] (aot.filter P Xs)))
\\ Representative inventory reconciliation: validate receipt lines, apply
\\ requested amounts, retain shortages, and return the complete ordered report.
(define aot.receipt-valid?
  [_ Stock Requested] -> (and (>= Stock 0) (>= Requested 0)))
(define aot.receipt
  [Id Stock Requested] -> [Id (- Stock Requested)])
(define aot.shortage?
  [_ Remaining] -> (< Remaining 0))
(define aot.shortage-total
  [] -> 0
  [[_ Remaining] | Lines] -> (+ (- 0 Remaining) (aot.shortage-total Lines)))
(define aot.reconcile
  Lines -> (let Valid (aot.filter (fn aot.receipt-valid?) Lines)
                Remaining (map (fn aot.receipt) Valid)
                Short (aot.filter (fn aot.shortage?) Remaining)
             [Remaining Short (aot.shortage-total Short)]))
