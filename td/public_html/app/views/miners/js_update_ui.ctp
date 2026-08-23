<?
echo $ajax->div('FindingsDiv');
$findingText = 'Findings';
if ($hasRipeMine)
	$findingText = ">>> ".$findingText;
echo $html->link($findingText, '/mines/check_mines'); 
echo $ajax->divEnd('FindingsDiv');


echo $ajax->div('MessagesDiv');
$messageLinkName = 'Messages';
if ($unreadMessages > 0)
	$messageLinkName.=" ($unreadMessages)";
echo $html->link($messageLinkName, '/messages/list_all'); 
echo $ajax->divEnd('MessagesDiv');
?>