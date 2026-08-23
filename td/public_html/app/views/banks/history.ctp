<? echo $html->css('filtergrid'); ?>
<? echo $javascript->link('tablefilter/tablefilter_all'); ?>
<? echo $javascript->link('tablefilter/sortabletable'); ?>

<?
function Tooltip($Html, $text, $tip)
{
	return $text .' '. $Html->link('?', '#', array('onclick' => 'return false;', 'title' => $tip));
}
?>

<div id=fullcenter>

<? include 'tabs.inc' ?>

<?
echo "<h3>Loans and Deposits</h3>";
?>


<? if (!count($accounts)): ?>
<p>None</p>
<? else: ?>
	<p>
	Total principal: <? echo $market->commatize($summary['totalPrinciple']).'g'; ?>, 
	Average interest: <? echo round($summary['avgInterest'], 1); ?>,
	Late Days: <? echo $summary['latePayments']; ?>,
	Defaults: <? echo $summary['defaults'].'/'.count($accounts); ?>
	</p>
	
	<table id="loanTable" class="bank" >
	<thead >
	<? 
	$headers = array(
		'Created',
		'Type',
		'Principal', 
		'Interest', 
		'Duration', 
		'Bank',
		Tooltip($html, 'Lates', 'Total late days incurred by the borrower on this account.  Increments once per day while payment is overdue.'),
		Tooltip($html, 'Prev Lates', 'Total late days incurred by the borrower before this account was created.'),
		#Tooltip($html, 'Prev GYs', 'Total gold-years earned by the borrower before this account was created.  Gold-years are earned every time an on-time payment is made, accumulating balance*[time since last payment].'),
		Tooltip($html, 'Prev Dflts', 'Total defaults incurred by the borrower before this account was created.  A default is when an account accumulates 90 late days.'),
		);
	echo $html->tableHeaders($headers);  
	?>
	</thead>
	<?
	foreach($accounts as $a)
	{
		$cells = array(
			date('Y-m-d', $a['BankingAccount']['created_time']),
			$a['BankingAccount']['is_deposit'] ? 'deposit' : 'loan',
			$a['BankingAccount']['principle'],
			round($a['BankingAccount']['interest'], 2),
			$a['BankingAccount']['duration'],
			$html->link($a['bankName'], '/banks/view/'.$a['bankerName']),
			$a['BankingAccount']['late_payments'],
			$a['BankingAccount']['previous_late_payments'],
			#round($a['BankingAccount']['previous_gold_years'], 1),
			$a['BankingAccount']['previous_defaults'],
			);
			
		echo $html->tableCells(array($cells));
	}
	?>
	</table>
	<div id="PagingDiv"></div>
	

<? endif; ?>


<? 
$types = "'ymddate', 'String', 'us', 'us', 'us', 'String', 'us', 'us', 'us'";
?>
<script language="javascript" type="text/javascript">  
	var filters = {  
		paging: true,
		paging_length: 20,
		paging_target_id: 'PagingDiv',
		default_date_type: "YMD",
		col_1: "Select",
		col_5: "select", 
		sort: true,
		sort_config: {
			sort_types:[<? echo $types; ?>],
		},
		sort_images_path: '/img/'
	}  
	var loansTf = setFilterGrid("loanTable",1,filters);  
</script>  


<? 
echo '<p>'.$html->link('Click here to see your loan history and stats', '/banks/report/'.$minerName).'</p>'; 
?>

</div>
