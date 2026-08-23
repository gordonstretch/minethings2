<div id="fullcenter">

<h2>Profession</h2>

<p>You are a <b><? echo $minerProfessionName; ?></b></p>
<font color=#DD0000><? echo $message; ?></font>

<table class="profession-table" summary="Profession">

<?
$cells = array();
foreach ($professions as $p)
{
	if ($p['qualifies'])
		$buttonText = "Become a ".$p['name'];
	else
		$buttonText = $p['meldsNeeded'].' melds needed';
	if ($p['id'] == $minerProfessionId or !$p['qualifies'])
		$changeForm = "<input type=button value=\"".$buttonText."\" disabled />";
	else
	{
		$changeForm = $form->create(null, array('url' => '/miners/profession'));
		$changeForm.= $form->input('Miner.profession', array('type' => 'hidden', 'value' => $p['id']));
		$changeForm.= $form->end($buttonText);
	}
	
	$rowlet = array("<b>".$p['name']."</b>", $changeForm);
	$end = count($cells) - 1;
	if ($end >= 0 and count($cells[$end]) <= 2)	
		$cells[$end] = array_merge($cells[$end], $rowlet);
	else
		$cells[] = $rowlet;
	
}
echo $html->tableCells($cells, array('class' => 'even'), array('class' => 'odd') );
?>

</table>

<p>See the <? echo $html->link('Help page', '/miners/help#Professions'); ?> for details on each profession.</p>
<p>You may change your profession as often as you like provided that you have no vehicles, ships or aircraft en-route, you are not employed as a worker, and you do not own an active factory.</p>

</div>