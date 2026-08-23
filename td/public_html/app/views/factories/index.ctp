<SCRIPT LANGUAGE="Javascript1.2">
var actions = new Array();
<? foreach ($builtActions as $a) 
	echo "actions[".$a['id']."] = '".$a['name']." for ".$a['ore']." ore, ".$a['components']." c';\n";
?>

function UpdateSubmit( factoryId )
{
	submit = document.getElementById("Submit"+factoryId);
	actionSelect = document.getElementById("FactoryAction"+factoryId)
	if (actionSelect.value != "0")	
		submit.value = actions[actionSelect.value];
	else
		submit.value = 'Select action';
	submit.disabled = actionSelect.value == "0";
}
</SCRIPT>

<?
function shortenName($name)
{
	if (strlen($name) > 10)
		$name = substr($name, 0, 9).'...';
	return $name;	
}
?>

<div id="fullcenter">

<div style="float:right">
<H3><? echo $currentCityName; ?> Workers</H3>
<table>
<?
echo $html->tableHeaders(array('Name', 'CPH', 'Oil', 'Expires')); 
$totalCph = 0;
foreach($workers as $worker)
{
	$name = $html->link($worker['Miner']['name'], '/miners/profile/'.$worker['Miner']['name']);
	$oilForm= $form->create(null, array('action' => 'index', 'id' => 'OilForm'.$worker['id']));
	$oilForm.= $form->input('Unoiled.id', array('type' => 'hidden', 'value' => $worker['id']));
	$oilForm.= $form->end();
	$oilForm.= $worker['oiled'] ? 'oiled' : $html->link('[oil]', 'javascript:void(0);', array('onclick' => '$("OilForm'.$worker['id'].'").submit()'));
	echo $html->tableCells(array(array($name, $worker['cph'], $oilForm, $worker['expires'])));
	$totalCph += $worker['cph'];
}
echo "<tr><td>Total:</td><td>$totalCph</td></tr>";
?>
</table>
<BR>
<? 
echo $html->link('Hire more workers', '/factories/workers'); 
?>

</div>


<? 
if (isset($message))
	echo $message;
?>
<BR>


<p>You have <? echo $ore.' '. $html->link('Ore', '/items/view/'.$oreItemId); ?> and <? echo $oil.' '.$html->link('Oil', '/items/view/'.$oilItemId); ?> in <? echo $currentCityName; ?>.</p>

<? 
if (isset($workerMarketable))
{
	echo '<p>Currently employed by ';
	if ($employer) 
		echo $html->link($employer, '/miners/profile/'.$employer).' for '.$timeLeft;
	else 
	{
		echo 'nobody</p>';
		echo "<p>Find a job at the ".$html->link($workerMarketable['name'].' Market', '/marketables/market/'.$workerMarketable['id'])."</p>";
	}
}
?>

<? 
foreach($factories as $f)
{

	echo '<div style="border-style:solid; border-color:#707070; margin-right:340px; margin-bottom:15px; padding:10px;">';

	echo 'Factory ';
	if ($f['currentAction'])
	{
		echo '('.$f['currentAction'];
		echo ': '.round($f['componentsFinished'], 1).'/'.round($f['components'], 1).'c ';

		if ($f['control'])
			echo $html->link('cancel', '/factories/cancel/'.$f['id'], null, 'Cancel action for ore refund?');		
		echo ')';
	}
	else if ($f['control'] and $f['own'])
		echo $html->link('demolish', '/factories/demolish/'.$f['id'], null, 'Destroy factory for ore refund?');


	if ($f['built'] and !$f['currentAction'] and $f['control'])
	{
		$actionOptions = array(0 => '-----------------');
		foreach($builtActions as $a)
			$actionOptions[$a['id']] = $a['name'];
		
		$itemOptions = array(0 => '------------------');
		foreach($damagedItems as $i)
			$itemOptions[$i['id']] = $i['name'];


		echo $form->create('Factory', array('action' => 'index'));
		echo $form->input('Factory.id', array('type' => 'hidden', 'value' => $f['id']));
		echo "<table>";
		echo $html->tableCells(array(array(
			$form->input('Factory.factory_action_id', array(
				'options' => $actionOptions, 
				'id' => 'FactoryAction'.$f['id'], 
				'onChange' => 'UpdateSubmit('.$f['id'].')' )),
			$form->input('Factory.item_id', array(
				'options' => $itemOptions, 
				'id' => "FactoryItem".$f['id'])),
			)));
		echo "</table>";
		echo $form->end(array(
			'id' => "Submit".$f['id'], 
			));

		echo "<SCRIPT Language=Javascript1.2>UpdateSubmit(".$f['id'].");</SCRIPT>"; 
	}


	echo "<table>";
	$row = array();

	foreach($f['workers'] as $w)
	{			
		$name = shortenName($w['Miner']['name']);//.' more name ');
		$name = $html->link($name, '/miners/profile/'.$w['Miner']['name']);
		$cell = $name;
		if ($f['control'])
		{
			$cell.= $form->create(null, array('action' => 'index'));
			$cell.= $form->input('Worker.id', array('type' => 'hidden', 'value' => $w['id']));
			$cell.= $form->end('Idle '.$w['cph'].'cph');
		}
		//$row[] = $cell;
		$row[] = array($cell, array('style' => 'white-space:nowrap'));
		if (count($row) >= 4)
		{
			echo $html->tableCells(array($row));
			$row = array();
		}

	}

	if (count($idleWorkers) and !$f['atMaxWorkers'] and $f['control'])
	{
		$options = array();
		foreach($idleWorkers as $w)
		{
			$name = shortenName($w['Miner']['name']);//.' more name ');
			$options[$w['id']] = $name.' '.$w['cph'].'cph';
		}
		$cell = $form->create(null, array('action' => 'index'));
		$cell.= $form->input('Idler.id', array('options' => $options, 'label' => ''));
		$cell.= $form->input('Idler.factory_id', array('type' => 'hidden', 'value' => $f['id']));
		$cell.= $form->end("Assign");
		$row[] = $cell;
	}

	if (count($row))	
		echo $html->tableCells(array($row));

	echo "</table>";


	if ($f['currentAction'] and $f['actionTimeLeft'])
		echo $f['actionTimeLeft'].' until action complete.';

	if ($f['control'] and isset($f['rentalTimeLeft']))
	{
		echo '<BR>'.$f['rentalTimeLeft'].' until rental expires.';
		if (!$f['rentalHasEnoughTime'])
			echo '  <span style="color:red;">Need more workers!</span>';
	}

	if (!$f['control'] and isset($f['rentalTimeLeft']))
	{
		$controller = $html->link($f['controllerName'], '/miners/profile/'.$f['controllerName']);
		echo '<BR>Rented to '.$controller.' for '.$f['rentalTimeLeft'];
	}


	echo '</div>';
}
?>
	
<? if ($canBuild): ?>
<BR>
Build new Factory <? echo '('.$buildAction['components'].' components)'; ?>:
<?
echo $form->create('Factory', array('action' => 'index'));
echo $form->input('Factory.id',  array('type' => 'hidden', 'value' => 0));
echo $form->input('Factory.factory_action_id', array('type' => 'hidden', 'value' => $buildAction['id']));
echo $form->end($buildAction['name'].' for '.$buildAction['ore'].' ore');
endif;
?>
<BR>
<? echo $html->link('Rent Factory', '/'.$factoryRentalMarket['rrl']); ?> | <? echo $html->link('Buy/Sell Factory', '/'.$factoryMarket['rrl']); ?>


</div>
