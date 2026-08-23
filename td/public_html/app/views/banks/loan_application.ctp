<? echo $javascript->link('banking'); ?>

<div id="fullcenter">

<? include 'tabs.inc' ?>

<h1>Loan application</h1>
<p>If you'd like to borrow some gold from a bank, use this form to apply.</p>
<?
if (isset($message)) echo '<div class="error">'.$message.'</div>';
echo $form->create('', array('action' => 'loan_application'));
$update = 'UpdateLoanInfo($("Principle").value, $("Duration").value, $("Interest").value, $("Payment"), $("Payments"), $("Cost"));';
echo $form->input('BankingApplication.principle', array('id' => 'Principle', 'label' => 'Principal (g)', 'onkeyup' => $update));
echo $form->input('BankingApplication.interest', array('id' => 'Interest', 'label' => 'Monthly interest (%)', 'onkeyup' => $update));
echo $form->input('BankingApplication.duration', array('id' => 'Duration', 'label' => 'Duration (days)', 'onkeyup' => $update));
echo $form->input('BankingApplication.reason', array('type' => 'textarea'));
echo '<div>Weekly payments: <div id="Payments" style="display:inline"></div></div>';
echo '<div>Payment: <div id="Payment" style="display:inline"></div>g</div>';
echo '<div>Loan Cost: <div id="Cost" style="display:inline"></div>g</div>';

$bankExists = false;
echo '<p>Choose one or more banks where you\'d like to send copies of your application.  Once one application is accepted, the other copies are automatically canceled.</p>';
foreach($banks as $b)
	if ($b['Miner']['id'] != $minerId)
	{
		if ($b['blocked'])
			echo '<input type="checkbox" disabled="disabled">Bank of '.$b['Miner']['name'].' (blocked)</input>';
		else
			echo $form->input($b['Bank']['id'], array('label' => 'Bank of '.$b['Miner']['name'].' ('.$b['Miner']['meld_count'].')', 'type' => 'checkbox'));
		$bankExists = true;
	}
//echo $form->input(1000, array('label' => 'Bank of boo', 'type' => 'checkbox'));
//echo $form->input(2, array('label' => 'Bank of kampy hardcoded', 'type' => 'checkbox'));

if (!$bankExists)
	echo '<p>There are no active bankers.</p>';
echo $form->end(array('label' => 'Send Application', 'disabled' => !$bankExists));
?>
</div>